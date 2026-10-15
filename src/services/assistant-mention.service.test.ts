import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `@` 菜单素材库那一组的检索条件（设计方案 §10b「服务端多字段检索」）：只查这个人
 * 自己的、多词 AND、`#12` 只认序号、下钻按文件夹子树。
 */

const mockGenerationFindMany = vi.fn()
const mockProjectFindMany = vi.fn()
const mockFolderScopeWhere = vi.fn()

vi.mock('@/lib/db', () => ({
  db: {
    generation: {
      findMany: (...args: unknown[]) => mockGenerationFindMany(...args),
    },
    project: {
      findMany: (...args: unknown[]) => mockProjectFindMany(...args),
    },
  },
}))

vi.mock('@/services/asset-folder.service', () => ({
  folderScopeWhere: (...args: unknown[]) => mockFolderScopeWhere(...args),
}))

vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn(async () => ({ id: 'user-1' })),
}))

import {
  lookupMentionAssets,
  searchMentionLibrary,
} from './assistant-mention.service'

type FindManyArgs = {
  where: Record<string, unknown> & { AND?: { OR: unknown[] }[] }
  take: number
}

function generationArgs(): FindManyArgs {
  return mockGenerationFindMany.mock.calls[0]?.[0] as FindManyArgs
}

const ROW = {
  id: 'gen-1',
  url: 'https://cdn.test/gen-1.png',
  thumbnailUrl: null,
  outputType: 'IMAGE',
  seq: 12,
  prompt: '夜景海报',
  model: 'flux',
  createdAt: new Date('2026-10-01T00:00:00Z'),
  snapshot: null,
  folders: [{ project: { name: '海报' } }],
}

beforeEach(() => {
  mockGenerationFindMany.mockReset().mockResolvedValue([ROW])
  mockProjectFindMany.mockReset().mockResolvedValue([])
  mockFolderScopeWhere.mockReset().mockResolvedValue({ folders: 'scoped' })
})

describe('searchMentionLibrary', () => {
  it('⭐ 只查这个人自己的、完成了的；多词 = 每个词一条 AND', async () => {
    const result = await searchMentionLibrary('user-1', {
      q: '海报 夜景',
      limit: 50,
    })
    const args = generationArgs()
    expect(args.where).toMatchObject({ userId: 'user-1', status: 'COMPLETED' })
    expect(args.where.AND).toHaveLength(2)
    // 一页的上限由服务端夹住。
    expect(args.take).toBe(20)
    expect(result.items[0]).toMatchObject({
      id: 'gen-1',
      kind: 'image',
      thumb: 'https://cdn.test/gen-1.png',
      seq: 12,
      folders: ['海报'],
    })
  })

  it('`#12` 只认序号，不去搜提示词；文件夹名也不比', async () => {
    await searchMentionLibrary('user-1', { q: '#12', limit: 20 })
    expect(generationArgs().where.AND).toEqual([{ OR: [{ seq: 12 }] }])
    expect(mockProjectFindMany).not.toHaveBeenCalled()
  })

  it('类型词（视频）收窄到那一类', async () => {
    await searchMentionLibrary('user-1', { q: '视频', limit: 20 })
    expect(generationArgs().where.AND?.[0]?.OR).toContainEqual({
      outputType: 'VIDEO',
    })
  })

  it('下钻：按文件夹子树收窄；空查询时列这一层的子夹', async () => {
    await searchMentionLibrary('user-1', { q: '', folderId: 'f1', limit: 20 })
    expect(mockFolderScopeWhere).toHaveBeenCalledWith('user-1', 'f1')
    expect(generationArgs().where).toMatchObject({ folders: 'scoped' })
    expect(generationArgs().where.AND).toBeUndefined()
    expect(mockProjectFindMany.mock.calls[0]?.[0]).toMatchObject({
      where: { userId: 'user-1', isDeleted: false, parentId: 'f1' },
    })
  })
})

describe('lookupMentionAssets', () => {
  it('按地址查名字，只查这个人的；没地址不查库', async () => {
    expect(await lookupMentionAssets('user-1', [])).toEqual([])
    expect(mockGenerationFindMany).not.toHaveBeenCalled()
    await lookupMentionAssets('user-1', ['https://cdn.test/gen-1.png'])
    expect(generationArgs().where).toMatchObject({ userId: 'user-1' })
  })
})
