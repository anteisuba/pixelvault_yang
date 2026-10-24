import 'server-only'

import { STUDIO_CONVERSATION_ACTIVITY } from '@/constants/studio-shell'
import { db } from '@/lib/db'
import { Prisma } from '@/lib/generated/prisma/client'
import { ensureUser } from '@/services/user.service'
import type { StudioConversationActivity } from '@/types/studio-conversation-activity'

const ACTIVE = new Set(['QUEUED', 'RUNNING'])

/**
 * 左边列表那几段对话的封面 / 进度 / 最近出完的时间（第 9f 步 9f-3）。只看本人的任务
 *（`GenerationJob.conversationId` 记着是哪段对话里出的）。
 *
 * - 封面：最新一个出完、有产物的任务的那张（缩略图优先；视频 / 音频没有缩略图就不当封面）。
 * - 进度：还有任务在跑时，从最早那个在跑的任务往后算这一批 —— 出完（含失败）几个 / 一共几个。
 */
export async function listStudioConversationActivity(
  clerkId: string,
  ids: readonly string[],
): Promise<StudioConversationActivity[]> {
  const user = await ensureUser(clerkId)
  const since = new Date(
    Date.now() - STUDIO_CONVERSATION_ACTIVITY.batchWindowMs,
  )

  const [covers, recent] = await Promise.all([
    db.$queryRaw<
      {
        conversationId: string
        completedAt: Date | null
        thumbnailUrl: string | null
        url: string
        outputType: string
      }[]
    >(Prisma.sql`
      SELECT DISTINCT ON (j."conversationId")
        j."conversationId", j."completedAt", g."thumbnailUrl", g."url", g."outputType"
      FROM "GenerationJob" j
      JOIN "Generation" g ON g."id" = j."generationId"
      WHERE j."userId" = ${user.id}
        AND j."conversationId" IN (${Prisma.join(ids)})
        AND j."status" = 'COMPLETED'
      ORDER BY j."conversationId", j."createdAt" DESC
    `),
    db.generationJob.findMany({
      where: {
        userId: user.id,
        conversationId: { in: [...ids] },
        createdAt: { gte: since },
      },
      select: { conversationId: true, status: true, createdAt: true },
    }),
  ])

  const coverOf = new Map(covers.map((row) => [row.conversationId, row]))
  return ids.map((id) => {
    const latest = coverOf.get(id)
    const jobs = recent.filter((job) => job.conversationId === id)
    const active = jobs.filter((job) => ACTIVE.has(job.status))
    let progress: StudioConversationActivity['progress'] = null
    if (active.length) {
      const start = Math.min(...active.map((job) => job.createdAt.getTime()))
      const batch = jobs.filter((job) => job.createdAt.getTime() >= start)
      progress = { done: batch.length - active.length, total: batch.length }
    }
    return {
      id,
      cover: latest
        ? (latest.thumbnailUrl ??
          (latest.outputType === 'IMAGE' || latest.outputType === 'MODEL_3D'
            ? latest.url
            : null))
        : null,
      progress,
      latestDoneAt: latest?.completedAt?.toISOString() ?? null,
    }
  })
}
