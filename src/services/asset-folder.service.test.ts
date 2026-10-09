import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockQueryRaw = vi.fn()
const mockAggregate = vi.fn()

vi.mock('@/lib/db', () => ({
  db: {
    $queryRaw: (...a: unknown[]) => mockQueryRaw(...a),
    project: { aggregate: (...a: unknown[]) => mockAggregate(...a) },
  },
}))

import {
  countFolderItems,
  folderScopeWhere,
  topSortOrder,
} from '@/services/asset-folder.service'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('folderScopeWhere', () => {
  it('unfiled = in no live folder', async () => {
    expect(await folderScopeWhere('u1', null)).toEqual({
      folders: { none: { project: { isDeleted: false } } },
    })
  })

  it('a folder covers all its descendant folders too', async () => {
    mockQueryRaw.mockResolvedValue([{ id: 'f1' }, { id: 'f2' }, { id: 'f3' }])
    expect(await folderScopeWhere('u1', 'f1')).toEqual({
      folders: {
        some: {
          project: { isDeleted: false, id: { in: ['f1', 'f2', 'f3'] } },
        },
      },
    })
    const sql = (mockQueryRaw.mock.calls[0][0] as string[]).join('?')
    expect(sql).toContain('WITH RECURSIVE tree')
  })
})

describe('countFolderItems', () => {
  it('maps the per-folder distinct counts', async () => {
    mockQueryRaw.mockResolvedValue([
      { folderId: 'parent', n: 7 },
      { folderId: 'kid', n: 3 },
    ])

    expect(await countFolderItems('u1')).toEqual({ parent: 7, kid: 3 })
  })

  it('counts each image once per folder, hits in any descendant included', async () => {
    mockQueryRaw.mockResolvedValue([])
    await countFolderItems('u1', ['IMAGE'])

    const sql = (mockQueryRaw.mock.calls[0][0] as string[]).join('?')
    expect(sql).toContain('COUNT(DISTINCT pi."generationId")')
    // 递归展开祖先 → 每个活子孙，按祖先去重
    expect(sql).toContain('WITH RECURSIVE tree')
    expect(sql).toContain('JOIN "Project" AS c ON c."parentId" = t."nodeId"')
  })
})

describe('topSortOrder', () => {
  it('is one before the first of the level, 0 on an empty level', async () => {
    mockAggregate.mockResolvedValueOnce({ _min: { sortOrder: -2 } })
    expect(await topSortOrder('u1', null)).toBe(-3)

    mockAggregate.mockResolvedValueOnce({ _min: { sortOrder: null } })
    expect(await topSortOrder('u1', 'parent')).toBe(0)
  })
})
