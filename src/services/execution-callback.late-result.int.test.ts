/**
 * L2a 真库：被「判死」的任务等来了迟到的结果。
 *
 * sweeper（1 小时）/ 3D reaper（20 分钟）没听到 worker 回音就把任务判成
 * `callback_timeout`；worker 等满预算先停手的是 `generation_wait_limit`。这两类服务商
 * 那边可能还在跑、事后成功并已计费 —— 迟到的**成功**结果要落库、状态纠正回 COMPLETED，
 * 用量只记一笔；迟到的失败、用户取消的、其它失败码一律不动。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))
vi.mock('@/services/storage/r2', async (importOriginal) =>
  (await import('@/test/int/fake-r2')).fakeR2Module(await importOriginal()),
)

import { db } from '@/lib/db'
import { createTestUser, resetDatabase } from '@/test/int/db'
import { seedJob, sendCallback } from '@/test/int/execution-callback'
import { fakeBucket } from '@/test/int/fake-r2'

let me: Awaited<ReturnType<typeof createTestUser>>

const PROVIDER_VIDEO = 'https://provider.example.com/late.mp4'
const VIDEO_RESULT = {
  artifactUrl: PROVIDER_VIDEO,
  mimeType: 'video/mp4',
  width: 1280,
  height: 720,
  duration: 5,
  requestCount: 1,
}
const MODEL_3D_RESULT = {
  artifactUrl: 'https://cdn.example.com/model.glb',
  glbR2Key: 'generations/u/model.glb',
  mimeType: 'model/gltf-binary',
  requestCount: 1,
}

const reload = (id: string) =>
  db.generationJob.findUniqueOrThrow({ where: { id } })

async function seedReapedJob(
  errorCode: string,
  options: Parameters<typeof seedJob>[1] = {},
) {
  const job = await seedJob(me.id, options)
  return db.generationJob.update({
    where: { id: job.id },
    data: {
      status: 'FAILED',
      completedAt: new Date(),
      errorCode,
      errorMessage: 'Reaped by execution sweeper',
    },
  })
}

beforeEach(async () => {
  await resetDatabase()
  fakeBucket.reset()
  me = await createTestUser()
  fakeBucket.remote.set(PROVIDER_VIDEO, {
    buffer: Buffer.alloc(1024, 1),
    mimeType: 'video/mp4',
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('handleExecutionCallback · 判死后迟到的成功结果', () => {
  it.each(['callback_timeout', 'generation_wait_limit'])(
    '%s 的视频任务：落作品、纠正回 COMPLETED、清掉失败原因，用量只记一笔',
    async (errorCode) => {
      const job = await seedReapedJob(errorCode)

      const result = await sendCallback(job.id, 'result', VIDEO_RESULT)

      expect(result).toEqual({
        runId: job.id,
        jobStatus: 'COMPLETED',
        action: 'completed',
      })
      const revived = await reload(job.id)
      expect(revived).toMatchObject({
        status: 'COMPLETED',
        errorCode: null,
        errorMessage: null,
      })
      expect(revived.generationId).not.toBeNull()
      expect(await db.generation.count()).toBe(1)
      expect(await db.apiUsageLedger.count()).toBe(1)
    },
  )

  it('3D reaper 判死的模型任务同样落库', async () => {
    const job = await seedReapedJob('callback_timeout', {
      metadata: { outputType: 'MODEL_3D' },
    })

    const result = await sendCallback(job.id, 'result', MODEL_3D_RESULT)

    expect(result.action).toBe('completed')
    expect((await reload(job.id)).status).toBe('COMPLETED')
    expect(await db.generation.count()).toBe(1)
  })

  it('同一结果回执重放两次：第二次 ignored，⛔ 双写作品与用量', async () => {
    const job = await seedReapedJob('callback_timeout')

    await sendCallback(job.id, 'result', VIDEO_RESULT)
    const replay = await sendCallback(job.id, 'result', VIDEO_RESULT)

    expect(replay).toMatchObject({
      jobStatus: 'COMPLETED',
      action: 'ignored-terminal',
    })
    expect(await db.generation.count()).toBe(1)
    expect(await db.apiUsageLedger.count()).toBe(1)
  })

  it('迟到的失败回执：保持判死时的样子，一行不写', async () => {
    const job = await seedReapedJob('callback_timeout')

    const result = await sendCallback(job.id, 'result', {
      error: 'provider failed later',
    })

    expect(result.action).toBe('ignored-terminal')
    expect(await reload(job.id)).toMatchObject({
      status: 'FAILED',
      errorCode: 'callback_timeout',
    })
    expect(await db.generation.count()).toBe(0)
  })

  it.each([
    ['FAILED', 'provider_rate_limit'],
    ['FAILED', null],
    ['CANCELLED', null],
  ] as const)(
    '%s（%s）的任务：迟到的成功也不复活',
    async (status, errorCode) => {
      const job = await seedJob(me.id, { status })
      await db.generationJob.update({
        where: { id: job.id },
        data: { errorCode },
      })

      const result = await sendCallback(job.id, 'result', VIDEO_RESULT)

      expect(result.action).toBe('ignored-terminal')
      expect((await reload(job.id)).status).toBe(status)
      expect(await db.generation.count()).toBe(0)
      expect(await db.apiUsageLedger.count()).toBe(0)
    },
  )
})
