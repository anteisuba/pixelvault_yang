import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  findMany: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({
  db: {
    $queryRaw: mocks.queryRaw,
    generationJob: { findMany: mocks.findMany },
  },
}))
vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn(async () => ({ id: 'user-1' })),
}))

import { listStudioConversationActivity } from '@/services/studio-conversation-activity.service'

const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000)

describe('listStudioConversationActivity（9f-3）', () => {
  beforeEach(() => {
    mocks.queryRaw.mockReset()
    mocks.findMany.mockReset()
  })

  it('封面取最新出完的那张（缩略图优先，视频没缩略图不当封面）；进度只数还在跑的那一批', async () => {
    mocks.queryRaw.mockResolvedValue([
      {
        conversationId: 'a',
        completedAt: at(1),
        thumbnailUrl: null,
        url: 'https://cdn/a.png',
        outputType: 'IMAGE',
      },
      {
        conversationId: 'b',
        completedAt: at(5),
        thumbnailUrl: null,
        url: 'https://cdn/b.mp4',
        outputType: 'VIDEO',
      },
    ])
    mocks.findMany.mockResolvedValue([
      // a：更早那一批已经跑完，不算进这一批
      { conversationId: 'a', status: 'COMPLETED', createdAt: at(30) },
      { conversationId: 'a', status: 'COMPLETED', createdAt: at(3) },
      { conversationId: 'a', status: 'FAILED', createdAt: at(3) },
      { conversationId: 'a', status: 'RUNNING', createdAt: at(4) },
      { conversationId: 'a', status: 'QUEUED', createdAt: at(2) },
      { conversationId: 'b', status: 'COMPLETED', createdAt: at(6) },
    ])

    const result = await listStudioConversationActivity('clerk-1', [
      'a',
      'b',
      'c',
    ])

    expect(result).toEqual([
      {
        id: 'a',
        cover: 'https://cdn/a.png',
        progress: { done: 2, total: 4 },
        latestDoneAt: expect.any(String),
      },
      {
        id: 'b',
        cover: null,
        progress: null,
        latestDoneAt: expect.any(String),
      },
      { id: 'c', cover: null, progress: null, latestDoneAt: null },
    ])
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          conversationId: { in: ['a', 'b', 'c'] },
        }),
      }),
    )
  })
})
