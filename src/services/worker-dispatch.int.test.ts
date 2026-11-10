/**
 * L2a 真库：派发 outbox 与兜底清扫（worker-dispatch-outbox.service、execution-sweeper.service）。
 * 任务、outbox 全走真库，真派发（真签名请求）；只假执行 Worker（fetch）。
 * 核库里任务 / outbox 的状态、发给 Worker 的请求与返回值。
 */
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

vi.mock('server-only', () => ({}))

import {
  EXECUTION_OUTBOX_KINDS,
  EXECUTION_SWEEPER,
  EXECUTION_WORKER,
  WORKER_DISPATCH_OUTBOX,
} from '@/constants/execution'
import { GENERATION_ERROR_CODES } from '@/constants/generation-errors'
import { db } from '@/lib/db'
import {
  reconcileActiveGenerationJob,
  reconcileStaleGenerationJob,
  STALE_EXECUTION_FAILURE_MESSAGE,
  sweepStaleExecutions,
} from '@/services/execution-sweeper.service'
import {
  createWorkerGenerationJob,
  dispatchWorkerRunDurably,
  reconcileWorkerDispatch,
  sweepWorkerDispatchOutboxes,
  WORKER_DISPATCH_PREPARE_ABANDONED_MESSAGE,
} from '@/services/worker-dispatch-outbox.service'
import { createTestUser, resetDatabase } from '@/test/int/db'
import type { WorkerRunContext } from '@/types'

const WORKER = 'https://worker.test'
const worker = vi.hoisted(() => ({
  status: 200,
  requests: [] as Array<{ path: string; body: Record<string, unknown> }>,
}))

beforeAll(() => {
  vi.stubEnv('EXECUTION_WORKER_BASE_URL', WORKER)
  vi.stubEnv('INTERNAL_CALLBACK_SECRET', 'test-internal-secret-not-real')
})
afterAll(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

let me: Awaited<ReturnType<typeof createTestUser>>

beforeEach(async () => {
  await resetDatabase()
  me = await createTestUser()
  worker.status = 200
  worker.requests = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input instanceof Request ? input.url : input))
      if (url.origin !== WORKER) return new Response('nope', { status: 404 })
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      worker.requests.push({ path: url.pathname, body })
      return worker.status === 200
        ? Response.json({ workflowInstanceId: body.runId })
        : new Response('worker says no', { status: worker.status })
    }),
  )
})

const ago = (ms: number) => new Date(Date.now() - ms)

function seedJob(
  extra: Partial<{
    status: 'RUNNING' | 'COMPLETED' | 'CANCELLED'
    startedAt: Date | null
    externalRequestId: string
    updatedAt: Date
  }> = {},
) {
  return db.generationJob.create({
    data: {
      userId: me.id,
      adapterType: 'openai',
      provider: 'openai',
      modelId: 'gpt-image',
      status: 'RUNNING',
      startedAt: new Date(),
      ...extra,
    },
  })
}

function runContext(runId: string): WorkerRunContext {
  return {
    runId,
    workflowId: 'IMAGE_QUEUE',
    outputType: 'IMAGE',
    providerId: 'openai',
    apiKeyId: 'key-1',
    callbackUrl: 'https://app.test/api/internal/execution/callback',
    resolveKeyUrl: 'https://app.test/api/internal/execution/resolve-key',
    timeoutMs: 600_000,
    maxAttempts: 1,
    pollIntervalMs: 3_000,
    providerInput: {
      prompt: 'a cat',
      modelId: 'gpt-image',
      externalModelId: 'gpt-image-1',
      aspectRatio: '1:1',
    },
  }
}

function seedOutbox(
  jobId: string,
  extra: Partial<{
    kind: string
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED'
    payload: object
    attemptCount: number
    leaseExpiresAt: Date
    createdAt: Date
    updatedAt: Date
  }> = {},
) {
  return db.executionOutbox.create({
    data: {
      generationJobId: jobId,
      kind: EXECUTION_OUTBOX_KINDS.WORKER_DISPATCH,
      payload: { phase: 'ready', runContext: runContext(jobId) },
      attemptCount: 1,
      createdAt: ago(60_000),
      updatedAt: ago(WORKER_DISPATCH_OUTBOX.REDELIVERY_DELAY_MS + 1_000),
      ...extra,
    },
  })
}

const outboxOf = (id: string) =>
  db.executionOutbox.findUniqueOrThrow({ where: { id } })
const jobOf = (id: string) =>
  db.generationJob.findUniqueOrThrow({ where: { id } })

describe('建任务 / 派发（真库，假 Worker）', () => {
  it('建任务时同一事务里记下「准备中」的派发 outbox', async () => {
    const job = await createWorkerGenerationJob({
      userId: me.id,
      adapterType: 'openai',
      provider: 'openai',
      modelId: 'gpt-image',
      isPlatformFunded: false,
    })
    expect(
      await db.executionOutbox.findMany({ where: { generationJobId: job.id } }),
    ).toMatchObject([
      {
        kind: EXECUTION_OUTBOX_KINDS.WORKER_DISPATCH,
        status: 'PENDING',
        payload: { phase: 'preparing' },
      },
    ])
  })

  it('写下完整参数、派发一次、outbox 记完成', async () => {
    const job = await seedJob()
    const outbox = await seedOutbox(job.id, { payload: { phase: 'preparing' } })
    const ctx = runContext(job.id)

    expect(await dispatchWorkerRunDurably(ctx)).toEqual({
      delivered: true,
      workflowInstanceId: job.id,
    })
    expect(worker.requests).toEqual([
      { path: EXECUTION_WORKER.IMAGE_QUEUE_PATH, body: ctx },
    ])
    expect(await outboxOf(outbox.id)).toMatchObject({
      status: 'COMPLETED',
      payload: { phase: 'ready', runContext: ctx },
      result: { workflowInstanceId: job.id },
      attemptCount: 2,
    })
  })

  it('Worker 5xx（送没送到不知道）：outbox 放回待补发，不抛', async () => {
    worker.status = 503
    const job = await seedJob()
    const outbox = await seedOutbox(job.id)

    // 5xx 隔 DISPATCH_RETRY_DELAY_MS（250ms）再试一次，真等。⛔ 别换假时钟：假 setTimeout 会把
    // pg 连接池的连接超时一起快进，负载高时误报「timeout exceeded when trying to connect」。
    expect(await dispatchWorkerRunDurably(runContext(job.id))).toEqual({
      delivered: false,
    })
    expect(worker.requests).toHaveLength(EXECUTION_WORKER.DISPATCH_MAX_ATTEMPTS)
    expect(await outboxOf(outbox.id)).toMatchObject({
      status: 'PENDING',
      leaseExpiresAt: null,
    })
    expect((await jobOf(job.id)).status).toBe('RUNNING')
  })

  it('Worker 明确拒收（4xx）：outbox 判失败并抛出', async () => {
    worker.status = 400
    const job = await seedJob()
    const outbox = await seedOutbox(job.id)
    await expect(dispatchWorkerRunDurably(runContext(job.id))).rejects.toThrow()
    expect((await outboxOf(outbox.id)).status).toBe('FAILED')
  })

  it('别的请求正拿着租约（处理中、没过期）：轮询不补发', async () => {
    const job = await seedJob()
    await seedOutbox(job.id, {
      status: 'PROCESSING',
      leaseExpiresAt: new Date(Date.now() + 60_000),
    })
    expect(await reconcileWorkerDispatch(job)).toBeNull()
    expect(worker.requests).toHaveLength(0)
  })
})

describe('reconcileWorkerDispatch（真库，假 Worker）', () => {
  it('任务不在跑、没有 outbox、已送到：都不动', async () => {
    const done = await seedJob({ status: 'COMPLETED' })
    await seedOutbox(done.id)
    expect(
      await reconcileWorkerDispatch({ id: done.id, status: 'COMPLETED' }),
    ).toBeNull()

    const bare = await seedJob()
    expect(await reconcileWorkerDispatch(bare)).toBeNull()

    const delivered = await seedJob()
    await seedOutbox(delivered.id, { status: 'COMPLETED' })
    expect(await reconcileWorkerDispatch(delivered)).toBeNull()
    expect(worker.requests).toHaveLength(0)
  })

  it('待补发且过了间隔：补发并记完成；没过间隔：不敲 Worker', async () => {
    const job = await seedJob()
    const outbox = await seedOutbox(job.id)
    expect(await reconcileWorkerDispatch(job)).toBeNull()
    expect(worker.requests).toHaveLength(1)
    expect((await outboxOf(outbox.id)).status).toBe('COMPLETED')

    const recent = await seedJob()
    await seedOutbox(recent.id, { updatedAt: ago(1_000) })
    expect(await reconcileWorkerDispatch(recent)).toBeNull()
    expect(worker.requests).toHaveLength(1)
  })

  it('租约过期的处理中 outbox：补发', async () => {
    const job = await seedJob()
    await seedOutbox(job.id, {
      status: 'PROCESSING',
      leaseExpiresAt: ago(1),
      updatedAt: new Date(),
    })
    await reconcileWorkerDispatch(job)
    expect(worker.requests).toHaveLength(1)
  })

  it('补发次数用完：任务判失败（执行服务连不上），不再敲；晚到的回调已收尾就不报', async () => {
    const job = await seedJob()
    const outbox = await seedOutbox(job.id, {
      attemptCount: WORKER_DISPATCH_OUTBOX.MAX_DELIVERY_ATTEMPTS,
    })
    expect(await reconcileWorkerDispatch(job)).toMatchObject({
      errorCode: GENERATION_ERROR_CODES.EXECUTION_WORKER_UNAVAILABLE,
    })
    expect(await jobOf(job.id)).toMatchObject({
      status: 'FAILED',
      errorCode: GENERATION_ERROR_CODES.EXECUTION_WORKER_UNAVAILABLE,
    })
    expect((await outboxOf(outbox.id)).status).toBe('FAILED')

    const late = await seedJob({ status: 'COMPLETED' })
    await seedOutbox(late.id, {
      attemptCount: WORKER_DISPATCH_OUTBOX.MAX_DELIVERY_ATTEMPTS,
    })
    // 调用方读到的还是 RUNNING，库里回调已经把它收尾了
    expect(
      await reconcileWorkerDispatch({ id: late.id, status: 'RUNNING' }),
    ).toBeNull()
    expect((await jobOf(late.id)).status).toBe('COMPLETED')
    expect(worker.requests).toHaveLength(0)
  })

  it('准备太久没写完参数：判失败；还在准备期内：不动', async () => {
    const stuck = await seedJob()
    await seedOutbox(stuck.id, {
      payload: { phase: 'preparing' },
      createdAt: ago(WORKER_DISPATCH_OUTBOX.PREPARE_TIMEOUT_MS + 1_000),
    })
    expect(await reconcileWorkerDispatch(stuck)).toEqual({
      errorMessage: WORKER_DISPATCH_PREPARE_ABANDONED_MESSAGE,
      errorCode: GENERATION_ERROR_CODES.EXECUTION_WORKER_UNAVAILABLE,
    })
    expect((await jobOf(stuck.id)).status).toBe('FAILED')

    const fresh = await seedJob()
    await seedOutbox(fresh.id, { payload: { phase: 'preparing' } })
    expect(await reconcileWorkerDispatch(fresh)).toBeNull()
    expect((await jobOf(fresh.id)).status).toBe('RUNNING')
  })

  it('补发被明确拒收：任务判失败（请求被拒）', async () => {
    worker.status = 422
    const job = await seedJob()
    await seedOutbox(job.id)
    expect(await reconcileWorkerDispatch(job)).toMatchObject({
      errorCode: GENERATION_ERROR_CODES.EXECUTION_REQUEST_REJECTED,
    })
    expect((await jobOf(job.id)).errorCode).toBe(
      GENERATION_ERROR_CODES.EXECUTION_REQUEST_REJECTED,
    )
  })

  it('每日 sweep：任务已结束的 outbox 收尾，在跑的补发', async () => {
    const cancelled = await seedJob({ status: 'CANCELLED' })
    const old = await seedOutbox(cancelled.id)
    const running = await seedJob()
    await seedOutbox(running.id)

    expect(await sweepWorkerDispatchOutboxes()).toEqual({
      redelivered: 1,
      failed: 0,
      closed: 1,
    })
    expect(await outboxOf(old.id)).toMatchObject({
      status: 'FAILED',
      lastError: 'Job is CANCELLED; dispatch no longer needed',
    })
    expect(worker.requests.map((r) => r.body.runId)).toEqual([running.id])
  })
})

describe('execution-sweeper（真库）', () => {
  const stale = () => ago(EXECUTION_SWEEPER.STALE_JOB_THRESHOLD_MS + 60_000)

  it('什么都没落下：全是 0', async () => {
    await seedJob()
    expect(await sweepStaleExecutions()).toEqual({
      staleJobsReaped: 0,
      expiredOutboxesReaped: 0,
      dispatchOutboxes: { redelivered: 0, failed: 0, closed: 0 },
      undeliveredSearchGroundingCleared: 0,
    })
  })

  it('超时的在跑任务判失败；新的、已结束的不动', async () => {
    const orphan = await seedJob({ startedAt: stale() })
    const fresh = await seedJob()
    const done = await seedJob({ status: 'COMPLETED', startedAt: stale() })

    expect((await sweepStaleExecutions()).staleJobsReaped).toBe(1)
    expect(await jobOf(orphan.id)).toMatchObject({
      status: 'FAILED',
      errorMessage: STALE_EXECUTION_FAILURE_MESSAGE,
      errorCode: GENERATION_ERROR_CODES.CALLBACK_TIMEOUT,
    })
    expect((await jobOf(fresh.id)).status).toBe('RUNNING')
    expect((await jobOf(done.id)).status).toBe('COMPLETED')
  })

  it('租约过期的 outbox：预览图放回重做，提交类判失败，派发类补发', async () => {
    const job = await seedJob()
    const lease = { status: 'PROCESSING' as const, leaseExpiresAt: ago(1_000) }
    const preview = await seedOutbox(job.id, {
      ...lease,
      kind: EXECUTION_OUTBOX_KINDS.IMAGE_PREVIEW_DERIVATIVES,
      payload: {},
    })
    const submit = await seedOutbox(job.id, {
      ...lease,
      kind: EXECUTION_OUTBOX_KINDS.AUDIO_QUEUE_SUBMIT,
      payload: {},
    })
    const dispatch = await seedOutbox(job.id, lease)

    const result = await sweepStaleExecutions()
    expect(result).toMatchObject({
      expiredOutboxesReaped: 2,
      dispatchOutboxes: { redelivered: 1, failed: 0, closed: 0 },
    })
    expect(await outboxOf(preview.id)).toMatchObject({
      status: 'PENDING',
      leaseExpiresAt: null,
    })
    expect((await outboxOf(submit.id)).status).toBe('FAILED')
    expect((await outboxOf(dispatch.id)).status).toBe('COMPLETED')
  })

  it('过了交接窗口没人取的「先搜再画」来源清掉，其余元数据原样；新的留着', async () => {
    const withGrounding = JSON.stringify({
      outputType: 'IMAGE',
      searchGrounding: { status: 'empty', sources: [] },
    })
    const left = await seedJob({ externalRequestId: withGrounding })
    await db.generationJob.update({
      where: { id: left.id },
      data: {
        updatedAt: ago(EXECUTION_SWEEPER.SEARCH_GROUNDING_HANDOFF_MS + 60_000),
      },
    })
    const fresh = await seedJob({ externalRequestId: withGrounding })

    expect(
      (await sweepStaleExecutions()).undeliveredSearchGroundingCleared,
    ).toBe(1)
    expect((await jobOf(left.id)).externalRequestId).toBe(
      JSON.stringify({ outputType: 'IMAGE' }),
    )
    expect((await jobOf(fresh.id)).externalRequestId).toBe(withGrounding)
  })

  it('状态轮询顺手兜底：超时的判失败；新的、已结束的不写库', async () => {
    const orphan = await seedJob({ startedAt: stale() })
    expect(await reconcileStaleGenerationJob(orphan)).toBe(true)
    expect((await jobOf(orphan.id)).status).toBe('FAILED')

    const fresh = await seedJob()
    expect(await reconcileStaleGenerationJob(fresh)).toBe(false)
    expect(
      await reconcileStaleGenerationJob({
        id: fresh.id,
        status: 'COMPLETED',
        startedAt: null,
      }),
    ).toBe(false)
    expect((await jobOf(fresh.id)).status).toBe('RUNNING')
  })

  it('reconcileActiveGenerationJob：派发失败先报；派发没事再看超时；都没事回 null', async () => {
    const stuck = await seedJob({ startedAt: stale() })
    await seedOutbox(stuck.id, {
      attemptCount: WORKER_DISPATCH_OUTBOX.MAX_DELIVERY_ATTEMPTS,
    })
    expect(await reconcileActiveGenerationJob(stuck)).toMatchObject({
      errorCode: GENERATION_ERROR_CODES.EXECUTION_WORKER_UNAVAILABLE,
    })

    const orphan = await seedJob({ startedAt: stale() })
    await seedOutbox(orphan.id, { status: 'COMPLETED' })
    expect(await reconcileActiveGenerationJob(orphan)).toEqual({
      error: STALE_EXECUTION_FAILURE_MESSAGE,
      errorCode: GENERATION_ERROR_CODES.CALLBACK_TIMEOUT,
    })

    const healthy = await seedJob()
    expect(await reconcileActiveGenerationJob(healthy)).toBeNull()
  })
})
