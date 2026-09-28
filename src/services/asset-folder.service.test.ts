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
  it('unfiled = in no live folder', () => {
    expect(folderScopeWhere(null)).toEqual({
      folders: { none: { project: { isDeleted: false } } },
    })
  })

  it('a folder covers its subfolders too', () => {
    expect(folderScopeWhere('f1')).toEqual({
      folders: {
        some: {
          project: {
            isDeleted: false,
            OR: [{ id: 'f1' }, { parentId: 'f1' }],
          },
        },
      },
    })
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

  it('counts each image once per folder, subfolder hits included', async () => {
    mockQueryRaw.mockResolvedValue([])
    await countFolderItems('u1', ['IMAGE'])

    const sql = (mockQueryRaw.mock.calls[0][0] as string[]).join('?')
    expect(sql).toContain('COUNT(DISTINCT hit."generationId")')
    // 子夹里的那一张再算给父夹一次
    expect(sql).toContain(
      'JOIN "Project" AS parent ON parent."id" = f."parentId"',
    )
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
