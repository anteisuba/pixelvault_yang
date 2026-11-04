/**
 * L2a 真库：左边对话列表的封面 / 进度 / 最近出完的时间（9f-3）。
 * 只假 Clerk（`ensureUser` 见到资料齐全的行不去问 Clerk）；SQL 与库全真。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import type { GenerationJobStatus } from '@/lib/generated/prisma/client'
import { listStudioConversationActivity } from '@/features/studio/services/studio-conversation-activity.service'
import { db } from '@/lib/db'
import { createTestUser, resetDatabase } from '@/test/int/db'

const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000)

let me: Awaited<ReturnType<typeof createTestUser>>
let other: Awaited<ReturnType<typeof createTestUser>>

beforeEach(async () => {
  await resetDatabase()
  me = await createTestUser()
  other = await createTestUser()
})

async function job(
  userId: string,
  conversationId: string,
  status: GenerationJobStatus,
  minutesAgo: number,
  output?: {
    url: string
    thumbnailUrl?: string
    outputType?: 'IMAGE' | 'VIDEO'
  },
) {
  const generation = output
    ? await db.generation.create({
        data: {
          userId,
          url: output.url,
          storageKey: `k/${output.url}`,
          thumbnailUrl: output.thumbnailUrl ?? null,
          outputType: output.outputType ?? 'IMAGE',
          prompt: 'p',
          model: 'm',
          provider: 'fal',
        },
      })
    : null
  return db.generationJob.create({
    data: {
      userId,
      conversationId,
      status,
      adapterType: 'fal',
      provider: 'fal',
      modelId: 'm',
      createdAt: at(minutesAgo),
      completedAt: status === 'COMPLETED' ? at(minutesAgo - 0.5) : null,
      generationId: generation?.id ?? null,
    },
  })
}

describe('listStudioConversationActivity（9f-3）', () => {
  it('封面取最新出完的那张（缩略图优先，视频没缩略图不当封面）；进度只数还在跑的那一批', async () => {
    // a：更早那一批已经跑完，不算进这一批
    await job(me.id, 'a', 'COMPLETED', 30, { url: 'https://cdn/old.png' })
    await job(me.id, 'a', 'COMPLETED', 3, { url: 'https://cdn/a.png' })
    await job(me.id, 'a', 'FAILED', 3)
    await job(me.id, 'a', 'RUNNING', 4)
    await job(me.id, 'a', 'QUEUED', 2)
    await job(me.id, 'b', 'COMPLETED', 6, {
      url: 'https://cdn/b.mp4',
      outputType: 'VIDEO',
    })
    await job(me.id, 'd', 'COMPLETED', 8, {
      url: 'https://cdn/d.png',
      thumbnailUrl: 'https://cdn/d-thumb.webp',
    })
    // 别人在同名对话里出的不算
    await job(other.id, 'c', 'COMPLETED', 1, { url: 'https://cdn/x.png' })
    await job(other.id, 'c', 'RUNNING', 1)

    const result = await listStudioConversationActivity(me.clerkId, [
      'a',
      'b',
      'c',
      'd',
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
      {
        id: 'd',
        cover: 'https://cdn/d-thumb.webp',
        progress: null,
        latestDoneAt: expect.any(String),
      },
    ])
  })
})
