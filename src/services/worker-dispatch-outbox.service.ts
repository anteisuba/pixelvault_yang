import 'server-only'

import { z } from 'zod'

import type { GenerationJob, Prisma } from '@/lib/generated/prisma/client'

import {
  EXECUTION_OUTBOX,
  EXECUTION_OUTBOX_KINDS,
  EXECUTION_WORKFLOW_IDS,
  WORKER_DISPATCH_OUTBOX,
} from '@/constants/execution'
import { GENERATION_ERROR_CODES } from '@/constants/generation-errors'
import type { WorkerModel3DRunContext, WorkerRunContext } from '@/types'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import {
  dispatchExecutionWorkerRun,
  ExecutionWorkerDispatchError,
} from '@/services/execution-worker.service'
import {
  createGenerationJob,
  failActiveGenerationJob,
  type CreateGenerationJobInput,
} from '@/services/usage.service'

/**
 * 派发 outbox（o-worker 第 6 步「派发只走一条路」）。
 *
 * 图 / 视频 / 音频 / 3D 走执行 Worker 时，任务和一行 `WORKER_DISPATCH` outbox 在同一事务里建：
 *
 *  1. 建任务 → outbox `{ phase: 'preparing' }`（参考图上传、底模准备还没做完）
 *  2. 参数备齐 → 写成 `{ phase: 'ready', runContext }`，抢租约后派发
 *  3. Worker 回执 → COMPLETED；明确拒收 → FAILED（任务照旧判失败）；
 *     不知道送没送到（超时 / 5xx / 回执坏了）→ 放回 PENDING，任务照常交回 jobId
 *  4. 状态轮询（`reconcileWorkerDispatch`）和每日 sweep 补发 PENDING / 租约过期的行
 *
 * 补发安全：Worker 用任务 id 当 Workflow 实例 id，`getOrCreateWorkflowInstance` 撞上已有实例就
 * 直接返回它，所以送到过的那次不会被跑第二遍、不会重复扣费。
 *
 * 以前（11-02 之前）派发不明就留着任务干等回调，真没送到要等 sweeper 1 小时才判失败。
 */

type WorkerDispatchRunContext = WorkerRunContext | WorkerModel3DRunContext

/**
 * 存进 outbox 的就是当时发出去的那份，补发原样再发：这里只核对能决定发往哪里的两格，
 * ⛔ 不用 WorkerRunContextSchema 重新 parse —— Zod 会剥掉 schema 外的字段，补发出去的就和第一次不一样了。
 */
const ReadyPayloadSchema = z.object({
  phase: z.literal('ready'),
  runContext: z
    .object({
      runId: z.string().min(1),
      workflowId: z.enum(
        Object.values(EXECUTION_WORKFLOW_IDS) as [string, ...string[]],
      ),
    })
    .passthrough(),
})

const DispatchPayloadSchema = z.union([
  z.object({ phase: z.literal('preparing') }),
  ReadyPayloadSchema,
])

export const WORKER_DISPATCH_GAVE_UP_MESSAGE =
  'Execution worker could not be reached after repeated dispatch attempts'
export const WORKER_DISPATCH_PREPARE_ABANDONED_MESSAGE =
  'Generation was interrupted before it could be dispatched'

export type DurableDispatchResult =
  | { delivered: true; workflowInstanceId: string }
  /** 送没送到不知道：outbox 留着补发，调用方照常把 jobId 交回去。 */
  | { delivered: false }

export interface WorkerDispatchFailure {
  errorMessage: string
  errorCode: string
}

/** 建任务 + 同一事务里记下派发 outbox。只给走执行 Worker 的生成用。 */
export async function createWorkerGenerationJob(
  input: CreateGenerationJobInput,
): Promise<GenerationJob> {
  return db.$transaction(async (tx) => {
    const job = await createGenerationJob(input, tx)
    await tx.executionOutbox.create({
      data: {
        generationJobId: job.id,
        kind: EXECUTION_OUTBOX_KINDS.WORKER_DISPATCH,
        payload: { phase: 'preparing' },
      },
    })
    return job
  })
}

/**
 * 写下完整派发参数并派发一次。明确拒收 / 配置错误照旧抛出（调用方判任务失败）；
 * 送没送到不知道时返回 `{ delivered: false }`，之后由轮询 / sweep 补发。
 */
export async function dispatchWorkerRunDurably(
  runContext: WorkerDispatchRunContext,
): Promise<DurableDispatchResult> {
  const payload = {
    phase: 'ready',
    runContext,
  } as unknown as Prisma.InputJsonValue
  // 正常路径上 outbox 已由 createWorkerGenerationJob 建好；upsert 让漏建的调用方也有补发兜底。
  const outbox = await db.executionOutbox.upsert({
    where: {
      generationJobId_kind: {
        generationJobId: runContext.runId,
        kind: EXECUTION_OUTBOX_KINDS.WORKER_DISPATCH,
      },
    },
    create: {
      generationJobId: runContext.runId,
      kind: EXECUTION_OUTBOX_KINDS.WORKER_DISPATCH,
      payload,
    },
    update: { payload, status: 'PENDING', lastError: null },
    select: { id: true },
  })

  return deliver(outbox.id, runContext)
}

/**
 * 状态轮询 / sweep 调：任务还在 RUNNING、派发 outbox 没拿到回执时补发或判失败。
 * 返回失败信息 = 这次把任务判成了 FAILED；`null` = 任务照旧（已送到、补发了、或还没到补发时间）。
 */
export async function reconcileWorkerDispatch(
  job: { id: string; status: string },
  now = new Date(),
): Promise<WorkerDispatchFailure | null> {
  if (job.status !== 'RUNNING') return null

  const outbox = await db.executionOutbox.findUnique({
    where: {
      generationJobId_kind: {
        generationJobId: job.id,
        kind: EXECUTION_OUTBOX_KINDS.WORKER_DISPATCH,
      },
    },
  })
  if (!outbox) return null
  if (outbox.status === 'COMPLETED' || outbox.status === 'FAILED') return null
  if (
    outbox.status === 'PROCESSING' &&
    outbox.leaseExpiresAt &&
    outbox.leaseExpiresAt.getTime() > now.getTime()
  ) {
    return null
  }

  const parsed = DispatchPayloadSchema.safeParse(outbox.payload)
  if (!parsed.success) {
    return giveUp(job.id, outbox.id, {
      errorMessage: 'Dispatch payload is unreadable',
      errorCode: GENERATION_ERROR_CODES.EXECUTION_WORKER_UNAVAILABLE,
    })
  }

  if (parsed.data.phase === 'preparing') {
    if (
      now.getTime() - outbox.createdAt.getTime() <
      WORKER_DISPATCH_OUTBOX.PREPARE_TIMEOUT_MS
    ) {
      return null
    }
    return giveUp(job.id, outbox.id, {
      errorMessage: WORKER_DISPATCH_PREPARE_ABANDONED_MESSAGE,
      errorCode: GENERATION_ERROR_CODES.EXECUTION_WORKER_UNAVAILABLE,
    })
  }

  if (outbox.attemptCount >= WORKER_DISPATCH_OUTBOX.MAX_DELIVERY_ATTEMPTS) {
    return giveUp(job.id, outbox.id, {
      errorMessage: WORKER_DISPATCH_GAVE_UP_MESSAGE,
      errorCode: GENERATION_ERROR_CODES.EXECUTION_WORKER_UNAVAILABLE,
    })
  }

  if (
    outbox.status === 'PENDING' &&
    now.getTime() - outbox.updatedAt.getTime() <
      WORKER_DISPATCH_OUTBOX.REDELIVERY_DELAY_MS
  ) {
    return null
  }

  try {
    const result = await deliver(
      outbox.id,
      // 写进去的时候就是完整的 WorkerRunContext / WorkerModel3DRunContext（见上面 schema 的说明）。
      parsed.data.runContext as unknown as WorkerDispatchRunContext,
    )
    if (result.delivered) {
      logger.info('Worker dispatch redelivered from outbox', {
        jobId: job.id,
        attempt: outbox.attemptCount + 1,
      })
    }
    return null
  } catch (error) {
    // 明确拒收：deliver 已把 outbox 判 FAILED，这里把任务也判掉。
    const message = error instanceof Error ? error.message : String(error)
    const rejected =
      error instanceof ExecutionWorkerDispatchError &&
      error.outcome === 'rejected'
    return failJob(job.id, {
      errorMessage: message,
      errorCode: rejected
        ? GENERATION_ERROR_CODES.EXECUTION_REQUEST_REJECTED
        : GENERATION_ERROR_CODES.EXECUTION_WORKER_UNAVAILABLE,
    })
  }
}

/**
 * 每日 sweep：补发没人再轮询的任务（用户关了页面）。任务已不在 RUNNING 的，outbox 直接收尾。
 */
export async function sweepWorkerDispatchOutboxes(
  now = new Date(),
): Promise<{ redelivered: number; failed: number; closed: number }> {
  const rows = await db.executionOutbox.findMany({
    where: {
      kind: EXECUTION_OUTBOX_KINDS.WORKER_DISPATCH,
      OR: [
        { status: 'PENDING' },
        { status: 'PROCESSING', leaseExpiresAt: { lt: now } },
      ],
    },
    select: {
      id: true,
      generationJob: { select: { id: true, status: true } },
    },
    orderBy: { updatedAt: 'asc' },
    take: WORKER_DISPATCH_OUTBOX.SWEEP_LIMIT,
  })

  let redelivered = 0
  let failed = 0
  let closed = 0
  for (const row of rows) {
    if (row.generationJob.status !== 'RUNNING') {
      await db.executionOutbox.update({
        where: { id: row.id },
        data: {
          status: 'FAILED',
          lastError: `Job is ${row.generationJob.status}; dispatch no longer needed`,
          leaseExpiresAt: null,
          processedAt: now,
        },
      })
      closed += 1
      continue
    }
    try {
      const failure = await reconcileWorkerDispatch(row.generationJob, now)
      if (failure) failed += 1
      else redelivered += 1
    } catch (error) {
      logger.warn('Worker dispatch sweep failed for one outbox', {
        outboxId: row.id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return { redelivered, failed, closed }
}

async function deliver(
  outboxId: string,
  runContext: WorkerDispatchRunContext,
): Promise<DurableDispatchResult> {
  if (!(await claim(outboxId))) {
    // 别的请求正在发这一条（并发轮询）；它会把结果写回 outbox。
    return { delivered: false }
  }

  try {
    const result = await dispatchExecutionWorkerRun(runContext)
    await db.executionOutbox.update({
      where: { id: outboxId },
      data: {
        status: 'COMPLETED',
        result: { workflowInstanceId: result.workflowInstanceId },
        lastError: null,
        leaseExpiresAt: null,
        processedAt: new Date(),
      },
    })
    return { delivered: true, workflowInstanceId: result.workflowInstanceId }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (
      error instanceof ExecutionWorkerDispatchError &&
      error.outcome === 'unknown'
    ) {
      await db.executionOutbox.update({
        where: { id: outboxId },
        data: {
          status: 'PENDING',
          lastError: message,
          leaseExpiresAt: null,
        },
      })
      logger.warn(
        'Worker dispatch outcome unknown; outbox kept for redelivery',
        {
          jobId: runContext.runId,
          error: message,
          upstreamStatus: error.upstreamStatus,
        },
      )
      return { delivered: false }
    }

    await db.executionOutbox.update({
      where: { id: outboxId },
      data: {
        status: 'FAILED',
        lastError: message,
        leaseExpiresAt: null,
        processedAt: new Date(),
      },
    })
    throw error
  }
}

async function claim(outboxId: string): Promise<boolean> {
  const now = new Date()
  const result = await db.executionOutbox.updateMany({
    where: {
      id: outboxId,
      OR: [
        { status: 'PENDING' },
        { status: 'PROCESSING', leaseExpiresAt: { lt: now } },
      ],
    },
    data: {
      status: 'PROCESSING',
      attemptCount: { increment: 1 },
      leaseExpiresAt: new Date(now.getTime() + EXECUTION_OUTBOX.LEASE_MS),
    },
  })
  return result.count === 1
}

async function giveUp(
  jobId: string,
  outboxId: string,
  failure: WorkerDispatchFailure,
): Promise<WorkerDispatchFailure | null> {
  await db.executionOutbox.update({
    where: { id: outboxId },
    data: {
      status: 'FAILED',
      lastError: failure.errorMessage,
      leaseExpiresAt: null,
      processedAt: new Date(),
    },
  })
  return failJob(jobId, failure)
}

async function failJob(
  jobId: string,
  failure: WorkerDispatchFailure,
): Promise<WorkerDispatchFailure | null> {
  const result = await failActiveGenerationJob(jobId, failure)
  if (!result.transitioned) return null
  logger.warn('Generation job failed: worker dispatch never landed', {
    jobId,
    errorCode: failure.errorCode,
  })
  return failure
}
