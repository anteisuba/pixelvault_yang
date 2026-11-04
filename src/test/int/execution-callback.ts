/**
 * L2a 执行回执测试共用：在真库里摆一条在跑的任务，再按 Worker 的口径发回执。
 *
 * ```ts
 * const job = await seedJob(me.id, { metadata: { outputType: 'IMAGE', creditCost: 1 } })
 * await sendCallback(job.id, 'result', { artifactUrl: '…', imageR2Key: '…' })
 * ```
 */
import { db } from '@/lib/db'
import type { GenerationJobStatus } from '@/lib/generated/prisma/client'
import { handleExecutionCallback } from '@/services/execution-callback.service'
import type { ExecutionCallbackPayload } from '@/types'

export interface SeedJobOptions {
  status?: GenerationJobStatus
  adapterType?: string
  provider?: string
  modelId?: string
  prompt?: string
  /** 提交时写进 `externalRequestId` 的队列元数据；不给 = 空。 */
  metadata?: Record<string, unknown>
}

export function seedJob(userId: string, options: SeedJobOptions = {}) {
  return db.generationJob.create({
    data: {
      userId,
      status: options.status ?? 'RUNNING',
      adapterType: options.adapterType ?? 'fal',
      provider: options.provider ?? 'fal.ai',
      modelId: options.modelId ?? 'kling-video',
      prompt: options.prompt ?? 'cinematic prompt',
      externalRequestId: options.metadata
        ? JSON.stringify(options.metadata)
        : null,
    },
  })
}

export function sendCallback(
  runId: string,
  kind: ExecutionCallbackPayload['kind'],
  data: Record<string, unknown> = {},
  options?: Parameters<typeof handleExecutionCallback>[1],
) {
  return handleExecutionCallback(
    { runId, kind, ts: '2026-04-24T00:00:00.000Z', data },
    options,
  )
}
