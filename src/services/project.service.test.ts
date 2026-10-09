import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockEnsureUser = vi.fn()

vi.mock('@/services/user.service', () => ({
  ensureUser: (...a: unknown[]) => mockEnsureUser(...a),
}))

const mockProjectFindMany = vi.fn()
const mockProjectFindFirst = vi.fn()
const mockProjectCreate = vi.fn()
const mockProjectUpdate = vi.fn()
const mockProjectUpdateMany = vi.fn()
const mockProjectCount = vi.fn()
const mockProjectAggregate = vi.fn()
const mockItemFindMany = vi.fn()
const mockItemCreateMany = vi.fn()
const mockItemDeleteMany = vi.fn()
const mockGenFindMany = vi.fn()
const mockGenCount = vi.fn()
const mockExecuteRaw = vi.fn()
const mockQueryRaw = vi.fn()

const fakeDb = {
  project: {
    findMany: (...a: unknown[]) => mockProjectFindMany(...a),
    findFirst: (...a: unknown[]) => mockProjectFindFirst(...a),
    create: (...a: unknown[]) => mockProjectCreate(...a),
    update: (...a: unknown[]) => mockProjectUpdate(...a),
    updateMany: (...a: unknown[]) => mockProjectUpdateMany(...a),
    count: (...a: unknown[]) => mockProjectCount(...a),
    aggregate: (...a: unknown[]) => mockProjectAggregate(...a),
  },
  projectItem: {
    findMany: (...a: unknown[]) => mockItemFindMany(...a),
    createMany: (...a: unknown[]) => mockItemCreateMany(...a),
    deleteMany: (...a: unknown[]) => mockItemDeleteMany(...a),
  },
  generation: {
    findMany: (...a: unknown[]) => mockGenFindMany(...a),
    count: (...a: unknown[]) => mockGenCount(...a),
  },
  $executeRaw: (...a: unknown[]) => mockExecuteRaw(...a),
  $queryRaw: (...a: unknown[]) => mockQueryRaw(...a),
  $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(fakeDb),
}

// vi.mock 会被提到文件顶上 —— 用 getter 把 `fakeDb` 的读取推迟到真正用到时。
vi.mock('@/lib/db', () => ({
  get db() {
    return fakeDb
  },
}))

import {
  createProject,
  deleteProject,
  getFolderMemberships,
  getProjectHistory,
  listProjects,
  reorderProjects,
  updateFolderItems,
  updateProject,
} from '@/services/project.service'

const FAKE_USER = { id: 'db_user_1', clerkId: 'clerk_1' }

function projectRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'proj_1',
    name: 'Design Sprint',
    description: null,
    parentId: null,
    sortOrder: 0,
    pinnedOrder: null,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-02T00:00:00Z'),
    items: [],
    ...overrides,
  }
}

function coverItem(
  url: string,
  outputType: string,
  thumbnailUrl: string | null = null,
) {
  return { generation: { url, thumbnailUrl, previewUrl: null, outputType } }
}

/** `writeOrder` 那条 UPDATE 的 VALUES 摊平后是 [id, 位置, id, 位置, …]。 */
function writtenOrder(call: unknown[]): string[] {
  const values = (call[2] as { values: unknown[] }).values
  return values.filter((value): value is string => typeof value === 'string')
}

const FAKE_GENERATION_ROW = {
  id: 'gen_1',
  createdAt: new Date(),
  outputType: 'IMAGE',
  status: 'COMPLETED',
  url: 'https://example.com/gen.png',
  storageKey: 'generations/u1/image/gen.png',
  mimeType: 'image/png',
  width: 1024,
  height: 1024,
  duration: null,
  referenceImageUrl: null,
  prompt: 'A red circle',
  negativePrompt: null,
  model: 'seedream-4.5',
  provider: 'fal.ai',
  requestCount: 2,
  isPublic: false,
  isPromptPublic: false,
  userId: FAKE_USER.id,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockEnsureUser.mockResolvedValue(FAKE_USER)
})

describe('listProjects', () => {
  it('returns an empty list when no projects exist', async () => {
    mockProjectFindMany.mockResolvedValue([])
    expect(await listProjects('clerk_1')).toEqual([])
  })

  it('reads folders in the manual order and maps them to ProjectRecord', async () => {
    mockProjectFindMany.mockResolvedValue([
      projectRow({
        sortOrder: 3,
        pinnedOrder: 1,
        items: [
          // ⚠ 视频缺派生图 → 跳过（`.mp4` 塞进 <img> 画不出来）
          coverItem('https://example.com/c.mp4', 'VIDEO'),
          coverItem(
            'https://example.com/a.png',
            'IMAGE',
            'https://example.com/a.thumb.webp',
          ),
        ],
      }),
    ])

    const [record] = await listProjects('clerk_1')

    expect(mockProjectFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: FAKE_USER.id, isDeleted: false },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
    )
    expect(record).toMatchObject({
      id: 'proj_1',
      sortOrder: 3,
      pinnedOrder: 1,
      coverUrl: 'https://example.com/a.thumb.webp',
    })
  })

  it('lets a parent without its own images borrow a subfolder cover', async () => {
    mockProjectFindMany.mockResolvedValue([
      projectRow({ id: 'parent' }),
      projectRow({
        id: 'child',
        parentId: 'parent',
        items: [coverItem('https://example.com/k.png', 'IMAGE')],
      }),
    ])

    const records = await listProjects('clerk_1')

    expect(records.find((r) => r.id === 'parent')?.coverUrl).toBe(
      'https://example.com/k.png',
    )
  })

  it('borrows from deeper descendants too, nearest level first', async () => {
    mockProjectFindMany.mockResolvedValue([
      projectRow({ id: 'root' }),
      projectRow({ id: 'mid', parentId: 'root' }),
      projectRow({ id: 'mid2', parentId: 'root' }),
      projectRow({
        id: 'deep',
        parentId: 'mid',
        items: [coverItem('https://example.com/deep.png', 'IMAGE')],
      }),
      projectRow({
        id: 'near',
        parentId: 'mid2',
        items: [coverItem('https://example.com/near.png', 'IMAGE')],
      }),
      projectRow({
        id: 'deepest',
        parentId: 'deep',
        items: [coverItem('https://example.com/deepest.png', 'IMAGE')],
      }),
    ])

    const records = await listProjects('clerk_1')
    const cover = (id: string) => records.find((r) => r.id === id)?.coverUrl

    // 第二层的 deep 在手动顺序上先于 near；更深的 deepest 排在它们之后
    expect(cover('root')).toBe('https://example.com/deep.png')
    expect(cover('mid')).toBe('https://example.com/deep.png')
    expect(cover('mid2')).toBe('https://example.com/near.png')
  })
})

describe('createProject', () => {
  beforeEach(() => {
    mockProjectCount.mockResolvedValue(0)
    mockProjectAggregate.mockResolvedValue({ _min: { sortOrder: 3 } })
    mockProjectCreate.mockResolvedValue(projectRow())
  })

  it('puts the new folder first in its level', async () => {
    await createProject('clerk_1', { name: 'Design Sprint' })

    expect(mockProjectCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ parentId: null, sortOrder: 2 }),
      }),
    )
  })

  it('starts at 0 when the level is empty', async () => {
    mockProjectAggregate.mockResolvedValue({ _min: { sortOrder: null } })
    await createProject('clerk_1', { name: 'First' })

    expect(mockProjectCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sortOrder: 0 }),
      }),
    )
  })

  it('creates a subfolder under a folder of the user', async () => {
    mockProjectFindMany.mockResolvedValue([{ id: 'parent_1', parentId: null }])
    await createProject('clerk_1', { name: 'Child', parentId: 'parent_1' })

    expect(mockProjectFindMany).toHaveBeenCalledWith({
      where: { userId: FAKE_USER.id, isDeleted: false },
      select: { id: true, parentId: true },
    })
    expect(mockProjectCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ parentId: 'parent_1' }),
      }),
    )
  })

  it('nests at any depth (a fourth level is fine)', async () => {
    mockProjectFindMany.mockResolvedValue([
      { id: 'root', parentId: null },
      { id: 'kid', parentId: 'root' },
      { id: 'grandkid', parentId: 'kid' },
    ])
    await createProject('clerk_1', { name: 'Deep', parentId: 'grandkid' })

    expect(mockProjectCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ parentId: 'grandkid' }),
      }),
    )
  })

  it('refuses a parent that is not one of their live folders', async () => {
    mockProjectFindMany.mockResolvedValue([{ id: 'root', parentId: null }])
    await expect(
      createProject('clerk_1', { name: 'X', parentId: 'theirs' }),
    ).rejects.toThrow('Parent folder not found')
    expect(mockProjectCreate).not.toHaveBeenCalled()
  })

  it('throws when project limit is reached', async () => {
    mockProjectCount.mockResolvedValue(999)
    await expect(createProject('clerk_1', { name: 'Extra' })).rejects.toThrow(
      'Maximum',
    )
  })
})

describe('updateProject', () => {
  beforeEach(() => {
    mockProjectUpdate.mockResolvedValue(projectRow())
  })

  it('returns null when the folder is not theirs', async () => {
    mockProjectFindFirst.mockResolvedValue(null)
    expect(await updateProject('clerk_1', 'proj_1', { name: 'X' })).toBeNull()
    expect(mockProjectUpdate).not.toHaveBeenCalled()
  })

  it('moves a folder under another one and puts it first there', async () => {
    mockProjectFindFirst.mockResolvedValueOnce({
      parentId: null,
      pinnedOrder: null,
    })
    mockProjectFindMany.mockResolvedValue([
      { id: 'proj_1', parentId: null },
      { id: 'kid', parentId: 'proj_1' },
      { id: 'parent_1', parentId: null },
    ])
    mockProjectAggregate.mockResolvedValue({ _min: { sortOrder: 0 } })

    await updateProject('clerk_1', 'proj_1', { parentId: 'parent_1' })

    expect(mockProjectUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ parentId: 'parent_1', sortOrder: -1 }),
      }),
    )
  })

  it('moves a folder with subfolders under a deep folder', async () => {
    mockProjectFindFirst.mockResolvedValueOnce({
      parentId: null,
      pinnedOrder: null,
    })
    mockProjectFindMany.mockResolvedValue([
      { id: 'proj_1', parentId: null },
      { id: 'kid', parentId: 'proj_1' },
      { id: 'a', parentId: null },
      { id: 'b', parentId: 'a' },
      { id: 'c', parentId: 'b' },
    ])
    mockProjectAggregate.mockResolvedValue({ _min: { sortOrder: null } })

    await updateProject('clerk_1', 'proj_1', { parentId: 'c' })

    expect(mockProjectUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ parentId: 'c', sortOrder: 0 }),
      }),
    )
  })

  it('rejects moving a folder under one of its own descendants', async () => {
    mockProjectFindFirst.mockResolvedValueOnce({
      parentId: null,
      pinnedOrder: null,
    })
    mockProjectFindMany.mockResolvedValue([
      { id: 'proj_1', parentId: null },
      { id: 'kid', parentId: 'proj_1' },
      { id: 'grandkid', parentId: 'kid' },
    ])

    await expect(
      updateProject('clerk_1', 'proj_1', { parentId: 'grandkid' }),
    ).rejects.toThrow('its own subfolder')
    expect(mockProjectUpdate).not.toHaveBeenCalled()
  })

  it('rejects moving a folder into itself', async () => {
    mockProjectFindFirst.mockResolvedValue({
      parentId: null,
      pinnedOrder: null,
    })
    await expect(
      updateProject('clerk_1', 'proj_1', { parentId: 'proj_1' }),
    ).rejects.toThrow('itself')
  })

  it('pins to the front of the pinned group and unpins to null', async () => {
    mockProjectFindFirst.mockResolvedValue({
      parentId: null,
      pinnedOrder: null,
    })
    mockProjectAggregate.mockResolvedValue({ _min: { pinnedOrder: 0 } })
    await updateProject('clerk_1', 'proj_1', { pinned: true })
    expect(mockProjectUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ pinnedOrder: -1 }),
      }),
    )

    mockProjectFindFirst.mockResolvedValue({ parentId: null, pinnedOrder: 4 })
    await updateProject('clerk_1', 'proj_1', { pinned: false })
    expect(mockProjectUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ pinnedOrder: null }),
      }),
    )
  })
})

describe('reorderProjects', () => {
  it('writes the requested order first and keeps unmentioned siblings after it', async () => {
    mockProjectFindMany.mockResolvedValue([
      { id: 'a' },
      { id: 'b' },
      { id: 'c' },
    ])

    await reorderProjects('clerk_1', {
      kind: 'tree',
      parentId: null,
      ids: ['c', 'a', 'stranger'],
    })

    expect(mockProjectFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: FAKE_USER.id, isDeleted: false, parentId: null },
      }),
    )
    expect(writtenOrder(mockExecuteRaw.mock.calls[0])).toEqual(['c', 'a', 'b'])
  })

  it('reorders the pinned group', async () => {
    mockProjectFindMany.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }])

    await reorderProjects('clerk_1', { kind: 'pins', ids: ['p2', 'p1'] })

    expect(mockProjectFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: FAKE_USER.id,
          isDeleted: false,
          pinnedOrder: { not: null },
        },
      }),
    )
    expect(writtenOrder(mockExecuteRaw.mock.calls[0])).toEqual(['p2', 'p1'])
  })
})

describe('deleteProject', () => {
  it('returns false when the folder is not theirs', async () => {
    mockProjectFindFirst.mockResolvedValue(null)
    expect(await deleteProject('clerk_1', 'proj_1')).toBe(false)
  })

  it('drops its items, moves subfolders up into its slot and soft-deletes it', async () => {
    mockProjectFindFirst.mockResolvedValue({ id: 'proj_1', parentId: null })
    mockProjectFindMany
      .mockResolvedValueOnce([{ id: 'kid_1' }, { id: 'kid_2' }])
      .mockResolvedValueOnce([
        { id: 'first' },
        { id: 'proj_1' },
        { id: 'last' },
      ])

    expect(await deleteProject('clerk_1', 'proj_1')).toBe(true)

    expect(mockItemDeleteMany).toHaveBeenCalledWith({
      where: { projectId: 'proj_1' },
    })
    expect(mockProjectUpdateMany).toHaveBeenCalledWith({
      where: { parentId: 'proj_1', userId: FAKE_USER.id, isDeleted: false },
      data: { parentId: null },
    })
    expect(mockProjectUpdate).toHaveBeenCalledWith({
      where: { id: 'proj_1', userId: FAKE_USER.id },
      data: { isDeleted: true, pinnedOrder: null },
    })
    expect(writtenOrder(mockExecuteRaw.mock.calls[0])).toEqual([
      'first',
      'kid_1',
      'kid_2',
      'last',
    ])
  })

  it('moves the subfolders of a nested folder up one level, into its parent', async () => {
    mockProjectFindFirst.mockResolvedValue({ id: 'mid', parentId: 'root' })
    mockProjectFindMany
      .mockResolvedValueOnce([{ id: 'kid_1' }])
      .mockResolvedValueOnce([{ id: 'mid' }, { id: 'sibling' }])

    expect(await deleteProject('clerk_1', 'mid')).toBe(true)

    expect(mockProjectFindMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { parentId: 'root', userId: FAKE_USER.id, isDeleted: false },
      }),
    )
    expect(mockProjectUpdateMany).toHaveBeenCalledWith({
      where: { parentId: 'mid', userId: FAKE_USER.id, isDeleted: false },
      data: { parentId: 'root' },
    })
    expect(writtenOrder(mockExecuteRaw.mock.calls[0])).toEqual([
      'kid_1',
      'sibling',
    ])
  })
})

describe('updateFolderItems', () => {
  it('adds only the ones that are not in the folder yet', async () => {
    mockProjectFindFirst.mockResolvedValue({ id: 'proj_1', name: 'A' })
    mockGenFindMany.mockResolvedValue([{ id: 'g1' }, { id: 'g2' }])
    mockItemFindMany.mockResolvedValue([{ generationId: 'g1' }])

    const result = await updateFolderItems('clerk_1', 'proj_1', {
      add: ['g1', 'g2', 'g1'],
    })

    expect(result).toEqual({ added: ['g2'], removed: [] })
    expect(mockItemCreateMany).toHaveBeenCalledWith({
      data: [{ projectId: 'proj_1', generationId: 'g2' }],
      skipDuplicates: true,
    })
  })

  it('removes only the ones that were in it', async () => {
    mockProjectFindFirst.mockResolvedValue({ id: 'proj_1', name: 'A' })
    mockItemFindMany.mockResolvedValue([{ generationId: 'g1' }])

    const result = await updateFolderItems('clerk_1', 'proj_1', {
      remove: ['g1', 'g9'],
    })

    expect(result).toEqual({ added: [], removed: ['g1'] })
    expect(mockItemDeleteMany).toHaveBeenCalledWith({
      where: { projectId: 'proj_1', generationId: { in: ['g1'] } },
    })
  })

  it('returns null when the folder is not theirs', async () => {
    mockProjectFindFirst.mockResolvedValue(null)
    expect(
      await updateFolderItems('clerk_1', 'theirs', { add: ['g1'] }),
    ).toBeNull()
    expect(mockItemCreateMany).not.toHaveBeenCalled()
  })
})

describe('getFolderMemberships', () => {
  it('lists the live folders of each asset, empty when it is in none', async () => {
    mockItemFindMany.mockResolvedValue([
      { generationId: 'g1', projectId: 'a' },
      { generationId: 'g1', projectId: 'b' },
    ])

    expect(await getFolderMemberships('clerk_1', ['g1', 'g2'])).toEqual({
      g1: ['a', 'b'],
      g2: [],
    })
    expect(mockItemFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          project: { userId: FAKE_USER.id, isDeleted: false },
        }),
      }),
    )
  })
})

describe('getProjectHistory', () => {
  it('skips exact count for unfiled history', async () => {
    mockGenFindMany.mockResolvedValue([FAKE_GENERATION_ROW])

    const result = await getProjectHistory('clerk_1', null, undefined, 20)

    expect(result.total).toBe(1)
    expect(result.hasMore).toBe(false)
    expect(mockGenCount).not.toHaveBeenCalled()
    expect(mockGenFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: FAKE_USER.id,
          folders: { none: { project: { isDeleted: false } } },
        },
      }),
    )
  })

  it('counts a folder together with all its descendant folders', async () => {
    mockGenFindMany.mockResolvedValue([FAKE_GENERATION_ROW])
    mockGenCount.mockResolvedValue(8)
    mockQueryRaw.mockResolvedValue([
      { id: 'proj_1' },
      { id: 'kid' },
      { id: 'grandkid' },
    ])

    const result = await getProjectHistory('clerk_1', 'proj_1', undefined, 20)

    expect(result.total).toBe(8)
    expect(mockGenCount).toHaveBeenCalledWith({
      where: {
        userId: FAKE_USER.id,
        folders: {
          some: {
            project: {
              isDeleted: false,
              id: { in: ['proj_1', 'kid', 'grandkid'] },
            },
          },
        },
      },
    })
  })
})
