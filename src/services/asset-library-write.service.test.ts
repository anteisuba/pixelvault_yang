import { describe, it, expect, beforeEach, vi } from 'vitest'

import { ASSISTANT_OPERATOR_TOOL_IDS } from '@/constants/assistant-operator'

/**
 * 素材库四条写操作（`docs/references/pages/assistant-shell-v2.md` §10）。
 *
 * ⭐ 这份测试的形状是**「做 → 撤 → 回到原状」**，⛔ 不是逐个函数断参数：§10 给
 * 这四条工具的完成判据只有一条 —— 「撤销能撤干净」，而那是一个**状态相等**的
 * 断言，断不出来的写法（mock 一个 `update` 然后检查它被调用过）恰恰放得过
 * 「统一取反」那种批量必错的实现。
 * 所以这里用一份**内存假库**：每条用例跑完之后把整份状态与初态比一遍。
 */

interface FakeGeneration {
  id: string
  userId: string
  projectId: string | null
  isPublic: boolean
  snapshot: Record<string, unknown> | null
}

interface FakeProject {
  id: string
  userId: string
  name: string
  parentId: string | null
  isDeleted: boolean
}

const store = {
  generations: [] as FakeGeneration[],
  projects: [] as FakeProject[],
  likes: new Set<string>(),
  projectSeq: 0,
}

const likeKey = (userId: string, generationId: string) =>
  `${userId}::${generationId}`

function snapshotOfWorld() {
  return JSON.stringify({
    generations: store.generations.map((row) => ({
      id: row.id,
      projectId: row.projectId,
      snapshot: row.snapshot,
    })),
    /**
     * ⚠ 软删的那些**不算在「原状」里**：`Project` 是软删表，撤销之后库里照旧留着
     * 一行 `isDeleted: true` —— 而用户看到的、素材库列出来的、这四条工具够得着的
     * 全都是「没删的那些」。拿物理行去比，等于要求撤销把一张软删表变成硬删表。
     */
    projects: store.projects
      .filter((row) => !row.isDeleted)
      .map((row) => ({ id: row.id, name: row.name, parentId: row.parentId })),
    likes: [...store.likes].sort(),
  })
}

/** 假库收到的 `where` 形状 —— 只声明这几条链真的会用到的那几格。 */
type IdFilter = string | { in: readonly string[] }

interface GenerationWhere {
  id?: IdFilter
  userId?: string
  OR?: { userId?: string; isPublic?: boolean }[]
}

interface ProjectWhere {
  id?: IdFilter
  userId?: string
  isDeleted?: boolean
  parentId?: string | null
}

interface LikeWhere {
  userId: string
  generationId: IdFilter
}

/** `{ in: [...] }` / 裸值都认 —— 服务里两种写法都在用。 */
function matches(value: unknown, filter: unknown): boolean {
  if (filter && typeof filter === 'object' && 'in' in filter) {
    return (filter as { in: unknown[] }).in.includes(value)
  }
  return value === filter
}

vi.mock('@/lib/db', () => {
  const generation = {
    findMany: async ({ where }: { where: GenerationWhere }) =>
      store.generations
        .filter((row) => {
          if (where.id !== undefined && !matches(row.id, where.id)) return false
          if (where.userId !== undefined && row.userId !== where.userId) {
            return false
          }
          if (Array.isArray(where.OR)) {
            const ok = where.OR.some(
              (clause) =>
                (clause.userId !== undefined && row.userId === clause.userId) ||
                (clause.isPublic !== undefined &&
                  row.isPublic === clause.isPublic),
            )
            if (!ok) return false
          }
          return true
        })
        .map((row) => ({ ...row })),
    update: async ({
      where,
      data,
    }: {
      where: { id: string; userId?: string }
      data: Partial<FakeGeneration>
    }) => {
      const row = store.generations.find(
        (item) =>
          item.id === where.id &&
          (where.userId === undefined || item.userId === where.userId),
      )
      if (!row) throw new Error('generation not found')
      Object.assign(row, data)
      return { ...row }
    },
  }

  const project = {
    count: async ({ where }: { where: ProjectWhere }) =>
      store.projects.filter(
        (row) => row.userId === where.userId && row.isDeleted === false,
      ).length,
    findFirst: async ({ where }: { where: ProjectWhere }) => {
      const row = store.projects.find(
        (item) =>
          item.id === where.id &&
          item.userId === where.userId &&
          item.isDeleted === false,
      )
      if (!row) return null
      return {
        ...row,
        _count: {
          generations: store.generations.filter(
            (gen) => gen.projectId === row.id,
          ).length,
          children: store.projects.filter(
            (child) => child.parentId === row.id && !child.isDeleted,
          ).length,
        },
      }
    },
    findMany: async ({ where }: { where: ProjectWhere }) =>
      store.projects
        .filter(
          (row) =>
            matches(row.id, where.id) &&
            row.userId === where.userId &&
            row.isDeleted === false,
        )
        .map((row) => ({ ...row })),
    create: async ({
      data,
    }: {
      data: { userId: string; name: string; parentId: string | null }
    }) => {
      store.projectSeq += 1
      const row: FakeProject = {
        id: `folder-${store.projectSeq}`,
        userId: data.userId,
        name: data.name,
        parentId: data.parentId ?? null,
        isDeleted: false,
      }
      store.projects.push(row)
      return { ...row }
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string; userId: string }
      data: Partial<FakeProject>
    }) => {
      const row = store.projects.find(
        (item) => item.id === where.id && item.userId === where.userId,
      )
      if (!row) throw new Error('project not found')
      Object.assign(row, data)
      return { ...row }
    },
  }

  const userLike = {
    findMany: async ({ where }: { where: LikeWhere }) =>
      [...store.likes]
        .map((key) => {
          const [userId, generationId] = key.split('::')
          return { userId, generationId }
        })
        .filter(
          (row) =>
            row.userId === where.userId &&
            matches(row.generationId, where.generationId),
        ),
    createMany: async ({
      data,
    }: {
      data: { userId: string; generationId: string }[]
    }) => {
      let count = 0
      for (const entry of data) {
        const key = likeKey(entry.userId, entry.generationId)
        if (!store.likes.has(key)) {
          store.likes.add(key)
          count += 1
        }
      }
      return { count }
    },
    deleteMany: async ({ where }: { where: LikeWhere }) => {
      let count = 0
      for (const key of [...store.likes]) {
        const [userId, generationId] = key.split('::')
        if (userId !== where.userId) continue
        if (!matches(generationId, where.generationId)) continue
        store.likes.delete(key)
        count += 1
      }
      return { count }
    },
  }

  return {
    db: {
      generation,
      project,
      userLike,
      /** `readAssetTags` 那一条：values = [userId, ids]。 */
      $queryRaw: async (
        _strings: TemplateStringsArray,
        ...values: unknown[]
      ) => {
        const [userId, ids] = values as [string, string[]]
        return store.generations
          .filter((row) => row.userId === userId && ids.includes(row.id))
          .map((row) => ({ id: row.id, tags: row.snapshot?.tags ?? null }))
      },
      /**
       * `writeAssetTags` 两条。
       *  · 有标签：values = [patchJson, assetId, userId]；
       *  · 清空：`- 'tags'`，values = [assetId, userId]（⚠ 删键不是写空数组）。
       */
      $executeRaw: async (
        _strings: TemplateStringsArray,
        ...values: unknown[]
      ) => {
        const clearing = values.length === 2
        const [patch, assetId, userId] = clearing
          ? ([null, ...(values as [string, string])] as [null, string, string])
          : (values as [string, string, string])
        const row = store.generations.find(
          (item) => item.id === assetId && item.userId === userId,
        )
        if (!row) return 0
        if (clearing) {
          const next = { ...(row.snapshot ?? {}) }
          delete next.tags
          row.snapshot = next
        } else {
          row.snapshot = { ...(row.snapshot ?? {}), ...JSON.parse(patch!) }
        }
        return 1
      },
    },
  }
})

vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn(async () => ({ id: 'user-1' })),
}))

import {
  AssetFolderLimitError,
  createAssetFolder,
  deleteEmptyAssetFolder,
  moveAssetsToFolder,
  revertAssistantAssetWrite,
  setAssetFavorites,
  tagAssets,
} from '@/services/asset-library-write.service'

const USER = 'user-1'
const OTHER = 'user-2'

beforeEach(() => {
  store.generations = [
    { id: 'a1', userId: USER, projectId: null, isPublic: false, snapshot: {} },
    {
      id: 'a2',
      userId: USER,
      projectId: 'folder-old',
      isPublic: false,
      snapshot: { tags: ['线稿'] },
    },
    {
      id: 'a3',
      userId: USER,
      projectId: null,
      isPublic: false,
      snapshot: null,
    },
    { id: 'x1', userId: OTHER, projectId: null, isPublic: true, snapshot: {} },
  ]
  store.projects = [
    {
      id: 'folder-old',
      userId: USER,
      name: '旧夹',
      parentId: null,
      isDeleted: false,
    },
    {
      id: 'folder-theirs',
      userId: OTHER,
      name: '别人的',
      parentId: null,
      isDeleted: false,
    },
  ]
  store.likes = new Set([likeKey(USER, 'a2')])
  store.projectSeq = 0
})

describe('tag_asset', () => {
  it('做 → 撤 → 回到原状（已经有的标签不动）', async () => {
    const before = snapshotOfWorld()

    const { entries } = await tagAssets(USER, ['a1', 'a2'], ['线稿', '角色'])

    // a2 本来就有「线稿」→ 这一步只新加了「角色」，撤销也只该摘这一个。
    expect(entries).toEqual([
      { assetId: 'a1', tags: ['线稿', '角色'] },
      { assetId: 'a2', tags: ['角色'] },
    ])
    expect(store.generations[1].snapshot).toEqual({ tags: ['线稿', '角色'] })

    await revertAssistantAssetWrite(USER, {
      tool: ASSISTANT_OPERATOR_TOOL_IDS.tagAsset,
      entries,
    })

    expect(store.generations[1].snapshot).toEqual({ tags: ['线稿'] })
    expect(snapshotOfWorld()).toBe(before)
  })

  it('别人的素材够不着，且 snapshot 缺席时照样打得上', async () => {
    const { entries, skipped } = await tagAssets(USER, ['a3', 'x1'], ['草稿'])

    expect(entries).toEqual([{ assetId: 'a3', tags: ['草稿'] }])
    expect(skipped).toBe(1)
    expect(store.generations[3].snapshot).toEqual({})
  })
})

describe('favorite_asset', () => {
  /**
   * ⭐ §10 那条 ⚠ 的直接用例：a2 本来就收藏着，a1 / a3 没有。`inverse` 必须
   * 逐条记原值 —— 记成「取反」的实现撤完会把 a2 的收藏清掉。
   */
  it('做 → 撤 → 回到原状（一批里原值混合）', async () => {
    const before = snapshotOfWorld()

    const { entries } = await setAssetFavorites(USER, ['a1', 'a2', 'a3'], true)

    expect(entries).toEqual([
      { assetId: 'a1', value: false },
      { assetId: 'a2', value: true },
      { assetId: 'a3', value: false },
    ])
    expect(store.likes.size).toBe(3)

    await revertAssistantAssetWrite(USER, {
      tool: ASSISTANT_OPERATOR_TOOL_IDS.favoriteAsset,
      entries,
    })

    expect([...store.likes]).toEqual([likeKey(USER, 'a2')])
    expect(snapshotOfWorld()).toBe(before)
  })

  it('别人的素材够不着', async () => {
    const { entries } = await setAssetFavorites(USER, ['x1'], true)
    expect(entries).toEqual([])
    expect(store.likes.has(likeKey(USER, 'x1'))).toBe(false)
  })
})

describe('create_folder', () => {
  it('做 → 撤 → 回到原状（空夹子才删得掉）', async () => {
    const before = snapshotOfWorld()

    const folder = await createAssetFolder(USER, { name: '角色参考' })
    expect(folder.parentId).toBeNull()

    const result = await revertAssistantAssetWrite(USER, {
      tool: ASSISTANT_OPERATOR_TOOL_IDS.createFolder,
      folderId: folder.folderId,
    })

    expect(result).toEqual({ revertedCount: 1, skipped: 0 })
    expect(snapshotOfWorld()).toBe(before)
  })

  /** ⛔ 撤销之前用户往里丢了东西 → 删掉就不是撤销，是毁数据。 */
  it('夹子里后来有了东西就不删，并如实回报', async () => {
    const folder = await createAssetFolder(USER, { name: '角色参考' })
    await moveAssetsToFolder(USER, ['a1'], folder.folderId)

    const result = await revertAssistantAssetWrite(USER, {
      tool: ASSISTANT_OPERATOR_TOOL_IDS.createFolder,
      folderId: folder.folderId,
    })

    expect(result).toEqual({ revertedCount: 0, skipped: 1 })
    expect(await deleteEmptyAssetFolder(USER, folder.folderId)).toBe(false)
    expect(
      store.projects.find((row) => row.id === folder.folderId)?.isDeleted,
    ).toBe(false)
  })

  it('别人的父夹当作没给，⛔ 不整条失败', async () => {
    const folder = await createAssetFolder(USER, {
      name: '角色参考',
      parentId: 'folder-theirs',
    })
    expect(folder.parentId).toBeNull()
  })

  it('撞上限时抛 AssetFolderLimitError，⛔ 不挤掉最老的那个', async () => {
    for (let i = 0; i < 60; i += 1) {
      store.projects.push({
        id: `bulk-${i}`,
        userId: USER,
        name: `f${i}`,
        parentId: null,
        isDeleted: false,
      })
    }
    await expect(createAssetFolder(USER, { name: '再来一个' })).rejects.toThrow(
      AssetFolderLimitError,
    )
  })
})

describe('move_assets', () => {
  /** ⭐ a1 原来没归档、a2 原来在旧夹里 —— 撤销要各回各家。 */
  it('做 → 撤 → 回到原状（一批里原位不同）', async () => {
    const before = snapshotOfWorld()
    const folder = await createAssetFolder(USER, { name: '角色参考' })

    const moved = await moveAssetsToFolder(
      USER,
      ['a1', 'a2', 'x1'],
      folder.folderId,
    )

    expect(moved?.entries).toEqual([
      { assetId: 'a1', folderId: null },
      { assetId: 'a2', folderId: 'folder-old' },
    ])
    expect(store.generations[0].projectId).toBe(folder.folderId)

    await revertAssistantAssetWrite(USER, {
      tool: ASSISTANT_OPERATOR_TOOL_IDS.moveAssets,
      entries: moved!.entries,
    })
    await deleteEmptyAssetFolder(USER, folder.folderId)

    expect(store.generations[0].projectId).toBeNull()
    expect(store.generations[1].projectId).toBe('folder-old')
    expect(snapshotOfWorld()).toBe(before)
  })

  it('目标夹不是他的 → null（调用方按 unknownFolder 拒）', async () => {
    expect(await moveAssetsToFolder(USER, ['a1'], 'folder-theirs')).toBeNull()
    expect(store.generations[0].projectId).toBeNull()
  })

  /** 原文件夹后来没了 → 回落成「未归档」，⛔ 不挪回一个不存在的夹子。 */
  it('撤销时原文件夹已被删 → 回落未归档', async () => {
    const folder = await createAssetFolder(USER, { name: '角色参考' })
    const moved = await moveAssetsToFolder(USER, ['a2'], folder.folderId)

    const old = store.projects.find((row) => row.id === 'folder-old')!
    old.isDeleted = true

    await revertAssistantAssetWrite(USER, {
      tool: ASSISTANT_OPERATOR_TOOL_IDS.moveAssets,
      entries: moved!.entries,
    })

    expect(store.generations[1].projectId).toBeNull()
  })
})
