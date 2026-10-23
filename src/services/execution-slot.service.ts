import 'server-only'

import {
  EXECUTION_SLOT,
  IMAGE_ACCOUNT_CONCURRENCY,
} from '@/constants/execution'
import { db } from '@/lib/db'
import type { ExecutionSlotRequest, ExecutionSlotResponse } from '@/types'

/**
 * 按账号排队（出图）。Worker 出图前来问一次「轮到我了吗」，没轮到就等几秒再问。
 *
 * - 同一个账号 = 同一个 slotKey：平台 key 按 adapter 全站一条队；自带 key 按那把
 *   key；没指定 key 的按「人 + adapter」。
 * - 占位 = 排上号（slotAcquiredAt 有值）且还在 RUNNING；出完 / 失败 / 取消就自动
 *   让出来，不用另外释放。
 * - 先来先出：比我早来、还在问的那些也算在我前面。
 * - 两道兜底：排上号超过 HOLDER_TTL 的不再算占位（Worker 死了没回调）；
 *   排队超过 WAITER_HEARTBEAT 没来问的不再算在前面（Worker 已经走了）。
 */
export async function acquireExecutionSlot(
  request: ExecutionSlotRequest,
): Promise<ExecutionSlotResponse> {
  const job = await db.generationJob.findUnique({
    where: { id: request.runId },
    select: { userId: true, adapterType: true },
  })
  if (!job) return { state: 'cancelled' }

  const limit = IMAGE_ACCOUNT_CONCURRENCY[job.adapterType]
  const slotKey = request.useSystemKey
    ? `system:${job.adapterType}`
    : request.apiKeyId
      ? `key:${request.apiKeyId}`
      : `user:${job.userId}:${job.adapterType}`

  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${slotKey}, 0))`

    const current = await tx.generationJob.findUnique({
      where: { id: request.runId },
      select: { status: true, createdAt: true, slotAcquiredAt: true },
    })
    if (!current || current.status !== 'RUNNING') return { state: 'cancelled' }
    if (current.slotAcquiredAt) return { state: 'granted' }

    const now = new Date()
    const grant = async (): Promise<ExecutionSlotResponse> => {
      // startedAt 从排上号算起：排队的时间不该算进「跑太久当死任务清掉」那道闸。
      await tx.generationJob.update({
        where: { id: request.runId },
        data: { slotKey, slotAcquiredAt: now, startedAt: now },
      })
      return { state: 'granted' }
    }
    if (limit === undefined) return grant()

    const [holding, ahead] = await Promise.all([
      tx.generationJob.count({
        where: {
          slotKey,
          status: 'RUNNING',
          id: { not: request.runId },
          slotAcquiredAt: {
            gte: new Date(now.getTime() - EXECUTION_SLOT.HOLDER_TTL_MS),
          },
        },
      }),
      tx.generationJob.count({
        where: {
          slotKey,
          status: 'RUNNING',
          slotAcquiredAt: null,
          createdAt: { lt: current.createdAt },
          updatedAt: {
            gte: new Date(now.getTime() - EXECUTION_SLOT.WAITER_HEARTBEAT_MS),
          },
        },
      }),
    ])
    if (holding + ahead < limit) return grant()

    // 没轮到：记下在排哪条队，顺便当心跳（updatedAt 跟着刷新）。
    await tx.generationJob.update({
      where: { id: request.runId },
      data: { slotKey },
    })
    return { state: 'waiting', ahead: holding + ahead - limit + 1 }
  })
}

/** 有 slotKey 但还没排上号 = 在排队。 */
export function isWaitingForSlot(job: {
  slotKey: string | null
  slotAcquiredAt: Date | null
}): boolean {
  return job.slotKey !== null && job.slotAcquiredAt === null
}
