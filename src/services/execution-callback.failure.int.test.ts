/**
 * L2a 真库：结果回执的失败面 —— 服务商报错、回执不合格、转存失败、事务回滚、与别的回执抢跑。
 * 只假 R2 的真 I/O 与 logger；核任务行的终态 / 错误原话，以及 ⛔ 多出来的作品与用量。
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
import type { GenerationJobStatus } from '@/lib/generated/prisma/client'
import { logger } from '@/lib/logger'
import { streamUploadToR2 } from '@/services/storage/r2'
import { createTestUser, resetDatabase } from '@/test/int/db'
import { seedJob, sendCallback } from '@/test/int/execution-callback'
import { FAKE_CDN, fakeBucket } from '@/test/int/fake-r2'

let me: Awaited<ReturnType<typeof createTestUser>>

const PROVIDER_VIDEO = 'https://provider.example.com/video.mp4'
const VIDEO_RESULT = {
  artifactUrl: PROVIDER_VIDEO,
  mimeType: 'video/mp4',
  width: 1280,
  height: 720,
  duration: 5,
  requestCount: 1,
}

const reload = (id: string) =>
  db.generationJob.findUniqueOrThrow({ where: { id } })
async function expectNothingWritten() {
  expect(await db.generation.count()).toBe(0)
  expect(await db.apiUsageLedger.count()).toBe(0)
}
/** 转存那一拍里，别的回执先把任务改成了 `status`（之后这次转存成功或失败）。 */
function raceDuringUpload(
  jobId: string,
  status: GenerationJobStatus,
  upload: 'succeeds' | 'fails',
) {
  vi.mocked(streamUploadToR2).mockImplementationOnce(async ({ key }) => {
    await db.generationJob.update({ where: { id: jobId }, data: { status } })
    if (upload === 'fails') throw new Error('R2 upload failed')
    return { publicUrl: `${FAKE_CDN}/${key}`, sizeBytes: 1024 }
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
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('handleExecutionCallback · 服务商报错', () => {
  it('任务判失败，原话与服务商细节存下、记一条 error', async () => {
    const job = await seedJob(me.id)
    const error = 'fal.ai request failed with status 422: prompt rejected'

    const result = await sendCallback(job.id, 'result', {
      error,
      providerMetadata: { provider: 'fal', phase: 'poll' },
      requestCount: 1,
    })

    expect(result).toEqual({
      runId: job.id,
      jobStatus: 'FAILED',
      action: 'failed',
    })
    const failed = await reload(job.id)
    expect(failed).toMatchObject({
      status: 'FAILED',
      requestCount: 1,
      errorMessage: error,
      providerFailure: expect.objectContaining({
        provider: 'fal.ai',
        modelId: 'kling-video',
        adapterType: 'fal',
        error,
        providerMetadata: { provider: 'fal', phase: 'poll' },
      }),
    })
    expect(failed.completedAt).not.toBeNull()
    expect(logger.error).toHaveBeenCalledWith(
      'Execution callback result reported provider failure',
      expect.objectContaining({
        runId: job.id,
        failureKind: 'provider',
        error,
      }),
    )
    await expectNothingWritten()
  })

  it('审核拦截：把阶段与类别前置到存下的原话上', async () => {
    const job = await seedJob(me.id)
    const bodyExcerpt = JSON.stringify({
      error: {
        message: 'Your request was rejected by the safety system.',
        code: 'moderation_blocked',
        moderation_details: {
          moderation_stage: 'output',
          categories: ['other'],
        },
      },
    })

    await sendCallback(job.id, 'result', {
      error: 'Your request was rejected by the safety system.',
      errorCode: 'content_filtered',
      providerMetadata: { provider: 'openai', bodyExcerpt },
    })

    expect(await reload(job.id)).toMatchObject({
      status: 'FAILED',
      errorMessage:
        '[moderation: output · other] Your request was rejected by the safety system.',
      errorCode: 'content_filtered',
    })
  })
})

describe('handleExecutionCallback · 回执不合格 / 落库失败', () => {
  it('结果里没有 artifactUrl：400，任务不动', async () => {
    const job = await seedJob(me.id)

    await expect(
      sendCallback(job.id, 'result', {
        providerMetadata: { requestId: 'request-1' },
      }),
    ).rejects.toMatchObject({ errorCode: 'VALIDATION_ERROR', httpStatus: 400 })
    expect((await reload(job.id)).status).toBe('RUNNING')
  })

  it('转存 R2 失败：任务判失败（storage_upload_failed），⛔ 落作品', async () => {
    const job = await seedJob(me.id)

    const result = await sendCallback(job.id, 'result', {
      ...VIDEO_RESULT,
      artifactUrl: 'https://provider.example.com/gone.mp4',
    })

    expect(result).toEqual({
      runId: job.id,
      jobStatus: 'FAILED',
      action: 'failed',
    })
    expect(await reload(job.id)).toMatchObject({
      status: 'FAILED',
      requestCount: 1,
      errorCode: 'storage_upload_failed',
      errorMessage: expect.stringContaining('Failed to fetch video for upload'),
      providerFailure: expect.objectContaining({
        provider: 'fal.ai',
        modelId: 'kling-video',
        errorCode: 'storage_upload_failed',
      }),
    })
    await expectNothingWritten()
  })

  it('事务里写到一半失败（角色卡已不在）：整笔回滚，任务判失败', async () => {
    const job = await seedJob(me.id, {
      metadata: { outputType: 'VIDEO', characterCardIds: ['deleted-card'] },
    })

    const result = await sendCallback(job.id, 'result', VIDEO_RESULT)

    expect(result.action).toBe('failed')
    expect(await reload(job.id)).toMatchObject({
      status: 'FAILED',
      generationId: null,
      errorCode: 'storage_upload_failed',
    })
    await expectNothingWritten()
  })
})

describe('handleExecutionCallback · 与别的回执抢跑', () => {
  it('转存时另一条结果回执已落库：ignored-concurrent，⛔ 双写作品与用量', async () => {
    const job = await seedJob(me.id)
    raceDuringUpload(job.id, 'COMPLETED', 'succeeds')

    await expect(sendCallback(job.id, 'result', VIDEO_RESULT)).resolves.toEqual(
      { runId: job.id, jobStatus: 'COMPLETED', action: 'ignored-concurrent' },
    )
    expect((await reload(job.id)).status).toBe('COMPLETED')
    await expectNothingWritten()
  })

  it('成功回执输给了一条失败回执：如实报 FAILED', async () => {
    const job = await seedJob(me.id)
    raceDuringUpload(job.id, 'FAILED', 'succeeds')

    await expect(sendCallback(job.id, 'result', VIDEO_RESULT)).resolves.toEqual(
      { runId: job.id, jobStatus: 'FAILED', action: 'ignored-concurrent' },
    )
    await expectNothingWritten()
  })

  it('转存失败时任务已被别的回执完成：⛔ 把完成的任务改成失败', async () => {
    const job = await seedJob(me.id)
    raceDuringUpload(job.id, 'COMPLETED', 'fails')

    await expect(sendCallback(job.id, 'result', VIDEO_RESULT)).resolves.toEqual(
      { runId: job.id, jobStatus: 'COMPLETED', action: 'ignored-concurrent' },
    )
    expect(await reload(job.id)).toMatchObject({
      status: 'COMPLETED',
      errorMessage: null,
    })
  })

  it('两条一样的结果回执同时到：只落一份作品与用量', async () => {
    const job = await seedJob(me.id)

    const results = await Promise.all([
      sendCallback(job.id, 'result', VIDEO_RESULT),
      sendCallback(job.id, 'result', VIDEO_RESULT),
    ])

    expect(results.map((r) => r.action).sort()).toEqual([
      'completed',
      'ignored-concurrent',
    ])
    expect(await db.generation.count()).toBe(1)
    expect(await db.apiUsageLedger.count()).toBe(1)
    expect((await reload(job.id)).status).toBe('COMPLETED')
  })
})
