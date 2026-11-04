/**
 * L2a 真库：助手改素材库的四条写操作（打标签 / 收藏 / 建夹 / 放进夹）各自「做 → 撤 → 回到原状」。
 * 核的是库里的行（snapshot.tags、UserLike、Project、ProjectItem）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { PROJECT } from '@/constants/config'
import { ASSISTANT_OPERATOR_TOOL_IDS } from '@/constants/assistant-operator'
import {
  AssetFolderLimitError,
  addAssetsToFolder,
  createAssetFolder,
  deleteEmptyAssetFolder,
  revertAssistantAssetWrite,
  setAssetFavorites,
  tagAssets,
} from '@/features/assets/services/asset-library-write.service'
import { db } from '@/lib/db'
import { createTestUser, resetDatabase } from '@/test/int/db'

type User = Awaited<ReturnType<typeof createTestUser>>
let me: User
let other: User

beforeEach(async () => {
  await resetDatabase()
  me = await createTestUser()
  other = await createTestUser()
})

function asset(userId: string, snapshot?: Record<string, unknown>) {
  return db.generation.create({
    data: {
      userId,
      url: 'https://cdn.test/x.png',
      storageKey: 'x.png',
      prompt: 'p',
      model: 'm',
      provider: 'p',
      ...(snapshot ? { snapshot: snapshot as object } : {}),
    },
  })
}

async function snapshotOf(id: string) {
  const row = await db.generation.findUniqueOrThrow({ where: { id } })
  return row.snapshot
}

/** 一个人库里的全部状态（标签、收藏、夹、夹里的东西），用来核「撤完回到原状」。 */
async function world(userId: string) {
  const [generations, likes, projects, items] = await Promise.all([
    db.generation.findMany({
      where: { userId },
      select: { id: true, snapshot: true },
      orderBy: { id: 'asc' },
    }),
    db.userLike.findMany({
      where: { userId },
      select: { generationId: true },
      orderBy: { generationId: 'asc' },
    }),
    db.project.findMany({
      where: { userId, isDeleted: false },
      select: { id: true, name: true, parentId: true },
      orderBy: { id: 'asc' },
    }),
    db.projectItem.findMany({
      where: { project: { userId } },
      select: { projectId: true, generationId: true },
      orderBy: [{ projectId: 'asc' }, { generationId: 'asc' }],
    }),
  ])
  return JSON.stringify({ generations, likes, projects, items })
}

describe('tag_asset', () => {
  it('做 → 撤 → 回到原状（已经有的标签不动）', async () => {
    const a1 = await asset(me.id, { prompt: 'x' })
    const a2 = await asset(me.id, { tags: ['线稿'] })
    const before = await world(me.id)

    const { entries } = await tagAssets(me.id, [a1.id, a2.id], ['线稿', '角色'])

    expect(entries).toEqual([
      { assetId: a1.id, tags: ['线稿', '角色'] },
      { assetId: a2.id, tags: ['角色'] },
    ])
    expect(await snapshotOf(a2.id)).toEqual({ tags: ['线稿', '角色'] })

    await revertAssistantAssetWrite(me.id, {
      tool: ASSISTANT_OPERATOR_TOOL_IDS.tagAsset,
      entries,
    })

    expect(await snapshotOf(a2.id)).toEqual({ tags: ['线稿'] })
    expect(await world(me.id)).toBe(before)
  })

  it('别人的素材够不着，且 snapshot 缺席时照样打得上', async () => {
    const mine = await asset(me.id)
    const theirs = await asset(other.id)

    const { entries, skipped } = await tagAssets(
      me.id,
      [mine.id, theirs.id],
      ['草稿'],
    )

    expect(entries).toEqual([{ assetId: mine.id, tags: ['草稿'] }])
    expect(skipped).toBe(1)
    expect(await snapshotOf(mine.id)).toEqual({ tags: ['草稿'] })
    expect(await snapshotOf(theirs.id)).toBeNull()
  })

  it('两次同时打标签 → 两组标签都在（后写的不覆盖先写的）', async () => {
    const a1 = await asset(me.id)

    await Promise.all([
      tagAssets(me.id, [a1.id], ['线稿']),
      tagAssets(me.id, [a1.id], ['并发']),
    ])

    const tags = ((await snapshotOf(a1.id)) as { tags: string[] }).tags
    expect([...tags].sort()).toEqual(['并发', '线稿'].sort())
  })

  it('一个标签都没给 → 什么都不写', async () => {
    const a1 = await asset(me.id)
    expect(await tagAssets(me.id, [a1.id], ['  '])).toEqual({
      entries: [],
      skipped: 0,
    })
    expect(await snapshotOf(a1.id)).toBeNull()
  })
})

describe('untag（撤销打标签）', () => {
  it('只摘 entries 里那几个：期间别人加上的还在', async () => {
    const a2 = await asset(me.id, { tags: ['线稿'] })
    await tagAssets(me.id, [a2.id], ['并发'])

    const result = await revertAssistantAssetWrite(me.id, {
      tool: ASSISTANT_OPERATOR_TOOL_IDS.tagAsset,
      entries: [{ assetId: a2.id, tags: ['线稿'] }],
    })

    expect(result).toEqual({ revertedCount: 1, skipped: 0 })
    expect(await snapshotOf(a2.id)).toEqual({ tags: ['并发'] })
  })

  it('摘光之后 snapshot 里没有 tags 这个键', async () => {
    const a2 = await asset(me.id, { tags: ['线稿'] })
    await revertAssistantAssetWrite(me.id, {
      tool: ASSISTANT_OPERATOR_TOOL_IDS.tagAsset,
      entries: [{ assetId: a2.id, tags: ['线稿'] }],
    })
    expect(await snapshotOf(a2.id)).toEqual({})
  })

  it('要摘的标签本来就不在 → skipped，不写', async () => {
    const a2 = await asset(me.id, { tags: ['线稿'] })
    const result = await revertAssistantAssetWrite(me.id, {
      tool: ASSISTANT_OPERATOR_TOOL_IDS.tagAsset,
      entries: [{ assetId: a2.id, tags: ['不存在'] }],
    })
    expect(result).toEqual({ revertedCount: 0, skipped: 1 })
    expect(await snapshotOf(a2.id)).toEqual({ tags: ['线稿'] })
  })
})

describe('favorite_asset', () => {
  it('做 → 撤 → 回到原状（一批里原值混合，不是整批取反）', async () => {
    const [a1, a2, a3] = [
      await asset(me.id),
      await asset(me.id),
      await asset(me.id),
    ]
    await db.userLike.create({ data: { userId: me.id, generationId: a2.id } })
    const before = await world(me.id)

    const { entries } = await setAssetFavorites(
      me.id,
      [a1.id, a2.id, a3.id],
      true,
    )

    expect(entries).toEqual(
      expect.arrayContaining([
        { assetId: a1.id, value: false },
        { assetId: a2.id, value: true },
        { assetId: a3.id, value: false },
      ]),
    )
    expect(await db.userLike.count({ where: { userId: me.id } })).toBe(3)

    await revertAssistantAssetWrite(me.id, {
      tool: ASSISTANT_OPERATOR_TOOL_IDS.favoriteAsset,
      entries,
    })

    const left = await db.userLike.findMany({ where: { userId: me.id } })
    expect(left.map((row) => row.generationId)).toEqual([a2.id])
    expect(await world(me.id)).toBe(before)
  })

  it('别人的素材够不着', async () => {
    const theirs = await asset(other.id)
    const { entries } = await setAssetFavorites(me.id, [theirs.id], true)
    expect(entries).toEqual([])
    expect(await db.userLike.count()).toBe(0)
  })
})

describe('create_folder', () => {
  it('做 → 撤 → 回到原状（空夹才删得掉）', async () => {
    const before = await world(me.id)

    const folder = await createAssetFolder(me.id, { name: ' 角色参考 ' })
    expect(folder).toMatchObject({ name: '角色参考', parentId: null })

    const result = await revertAssistantAssetWrite(me.id, {
      tool: ASSISTANT_OPERATOR_TOOL_IDS.createFolder,
      folderId: folder.folderId,
    })

    expect(result).toEqual({ revertedCount: 1, skipped: 0 })
    expect(await world(me.id)).toBe(before)
  })

  it('夹里后来有了东西就不删，并如实回报', async () => {
    const a1 = await asset(me.id)
    const folder = await createAssetFolder(me.id, { name: '角色参考' })
    await addAssetsToFolder(me.id, [a1.id], folder.folderId)

    const result = await revertAssistantAssetWrite(me.id, {
      tool: ASSISTANT_OPERATOR_TOOL_IDS.createFolder,
      folderId: folder.folderId,
    })

    expect(result).toEqual({ revertedCount: 0, skipped: 1 })
    const row = await db.project.findUniqueOrThrow({
      where: { id: folder.folderId },
    })
    expect(row.isDeleted).toBe(false)
  })

  it('有活子夹也不删', async () => {
    const parent = await createAssetFolder(me.id, { name: '父' })
    await createAssetFolder(me.id, { name: '子', parentId: parent.folderId })
    expect(await deleteEmptyAssetFolder(me.id, parent.folderId)).toBe(false)
  })

  it('层数不限：子夹、孙夹、曾孙夹都挂得上；新夹排在那一层最前面', async () => {
    const root = await createAssetFolder(me.id, { name: '根' })
    const kid = await createAssetFolder(me.id, {
      name: '子夹',
      parentId: root.folderId,
    })
    const grandchild = await createAssetFolder(me.id, {
      name: '孙夹',
      parentId: kid.folderId,
    })
    const greatGrandchild = await createAssetFolder(me.id, {
      name: '曾孙夹',
      parentId: grandchild.folderId,
    })
    expect(kid.parentId).toBe(root.folderId)
    expect(grandchild.parentId).toBe(kid.folderId)
    expect(greatGrandchild.parentId).toBe(grandchild.folderId)

    const second = await createAssetFolder(me.id, { name: '第二个根' })
    const [first, newer] = await Promise.all([
      db.project.findUniqueOrThrow({ where: { id: root.folderId } }),
      db.project.findUniqueOrThrow({ where: { id: second.folderId } }),
    ])
    expect(newer.sortOrder).toBeLessThan(first.sortOrder)
  })

  it('别人的父夹当作没给，⛔ 不整条失败', async () => {
    const theirs = await db.project.create({
      data: { userId: other.id, name: '别人的' },
    })
    const folder = await createAssetFolder(me.id, {
      name: '角色参考',
      parentId: theirs.id,
    })
    expect(folder.parentId).toBeNull()
  })

  it('撞上限时抛 AssetFolderLimitError，不挤掉最老的那个', async () => {
    await db.project.createMany({
      data: Array.from({ length: PROJECT.MAX_PROJECTS_PER_USER }, (_, i) => ({
        userId: me.id,
        name: `f${i}`,
      })),
    })
    await expect(
      createAssetFolder(me.id, { name: '再来一个' }),
    ).rejects.toThrow(AssetFolderLimitError)
    expect(await db.project.count({ where: { userId: me.id } })).toBe(
      PROJECT.MAX_PROJECTS_PER_USER,
    )
  })
})

describe('add_to_folder', () => {
  it('做 → 撤 → 回到原状（放进去是加，不是挪）', async () => {
    const [a1, a2] = [await asset(me.id), await asset(me.id)]
    const theirs = await asset(other.id)
    const old = await db.project.create({
      data: { userId: me.id, name: '旧夹' },
    })
    await db.projectItem.create({
      data: { projectId: old.id, generationId: a2.id },
    })
    const before = await world(me.id)

    const folder = await createAssetFolder(me.id, { name: '角色参考' })
    const filed = await addAssetsToFolder(
      me.id,
      [a1.id, a2.id, theirs.id],
      folder.folderId,
    )

    expect([...filed!.added].sort()).toEqual([a1.id, a2.id].sort())
    expect(
      await db.projectItem.count({
        where: { projectId: old.id, generationId: a2.id },
      }),
    ).toBe(1)

    const result = await revertAssistantAssetWrite(me.id, {
      tool: ASSISTANT_OPERATOR_TOOL_IDS.addToFolder,
      folderId: folder.folderId,
      assetIds: filed!.added,
    })
    expect(result).toEqual({ revertedCount: 2, skipped: 0 })
    await deleteEmptyAssetFolder(me.id, folder.folderId)

    expect(await world(me.id)).toBe(before)
  })

  it('已经在里面的不算：撤销只拿出新放进去的', async () => {
    const [a1, a2] = [await asset(me.id), await asset(me.id)]
    const old = await db.project.create({
      data: { userId: me.id, name: '旧夹' },
    })
    await db.projectItem.create({
      data: { projectId: old.id, generationId: a2.id },
    })

    const filed = await addAssetsToFolder(me.id, [a1.id, a2.id], old.id)
    expect(filed?.added).toEqual([a1.id])

    await revertAssistantAssetWrite(me.id, {
      tool: ASSISTANT_OPERATOR_TOOL_IDS.addToFolder,
      folderId: old.id,
      assetIds: filed!.added,
    })

    const items = await db.projectItem.findMany({
      where: { projectId: old.id },
    })
    expect(items.map((row) => row.generationId)).toEqual([a2.id])
  })

  it('目标夹不是他的 → null，不写', async () => {
    const a1 = await asset(me.id)
    const theirs = await db.project.create({
      data: { userId: other.id, name: '别人的' },
    })
    expect(await addAssetsToFolder(me.id, [a1.id], theirs.id)).toBeNull()
    expect(await db.projectItem.count()).toBe(0)
  })

  it('撤销时夹已被删 → 记作跳过', async () => {
    const a1 = await asset(me.id)
    const folder = await createAssetFolder(me.id, { name: '角色参考' })
    const filed = await addAssetsToFolder(me.id, [a1.id], folder.folderId)
    await db.project.update({
      where: { id: folder.folderId },
      data: { isDeleted: true },
    })

    const result = await revertAssistantAssetWrite(me.id, {
      tool: ASSISTANT_OPERATOR_TOOL_IDS.addToFolder,
      folderId: folder.folderId,
      assetIds: filed!.added,
    })

    expect(result).toEqual({ revertedCount: 0, skipped: 1 })
  })
})
