/**
 * L2a 真库 + 真提交链路：转 3D（提交 → 源图预检与预处理 → 建任务 → 派给执行 Worker）、状态、取消。
 * 只假边界：执行 Worker（fetch）、R2 的真 I/O。选路、真解密、预检、派发 outbox 全真：
 * 核任务行、派给 Worker 的东西与返回值。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/services/storage/r2', async (importOriginal) =>
  (await import('@/test/int/fake-r2')).fakeR2Module(await importOriginal()),
)

import sharp from 'sharp'

import { EXECUTION_WORKER } from '@/constants/execution'
import { GENERATION_ERROR_CODES } from '@/constants/generation-errors'
import { AI_MODELS } from '@/constants/models'
import { MODEL_3D_JOB_STAGE } from '@/constants/model-3d-generation'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { db } from '@/lib/db'
import {
  cancel3DGenerationForUserId,
  check3DGenerationStatusForUserId,
  continue3DGenerationForUserId,
  retryMesh3DGenerationForUserId,
  submit3DGeneration,
} from '@/services/generate-3d.service'
import { createTestUser, resetDatabase, seedAssistantKey } from '@/test/int/db'
import {
  installFakeExecutionWorker,
  type FakeExecutionWorker,
} from '@/test/int/execution-worker'
import { FAKE_CDN, fakeBucket } from '@/test/int/fake-r2'
import { seedGeneration } from '@/test/int/seed-generation'

const SOURCE = `${FAKE_CDN}/source.png`

let me: Awaited<ReturnType<typeof createTestUser>>
let worker: FakeExecutionWorker

async function hostPng(url: string, width: number, height: number) {
  fakeBucket.remote.set(url, {
    buffer: await sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 200, g: 100, b: 100, alpha: 1 },
      },
    })
      .png()
      .toBuffer(),
    mimeType: 'image/png',
  })
}

const jobsOfMe = () => db.generationJob.findMany({ where: { userId: me.id } })
const metaOf = (job: { externalRequestId: string | null }) =>
  JSON.parse(job.externalRequestId ?? '{}') as Record<string, unknown>
const runRequests = () =>
  worker.requests.filter((r) => r.path !== EXECUTION_WORKER.CANCEL_PATH)

beforeEach(async () => {
  await resetDatabase()
  fakeBucket.reset()
  me = await createTestUser()
  worker = installFakeExecutionWorker()
  // 1024² 正方形：不用放大、不用补白，预处理原样交回。
  await hostPng(SOURCE, 1024, 1024)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('submit3DGeneration', () => {
  it.each([AI_MODELS.HUNYUAN3D_V3, AI_MODELS.HUNYUAN3D_V31_PRO])(
    '%s：派给 Hunyuan3D Worker，回调要用的来源先落在任务行上',
    async (modelId) => {
      const key = await seedAssistantKey(me.id, AI_ADAPTER_TYPES.FAL)

      const result = await submit3DGeneration(me.clerkId, {
        imageUrl: SOURCE,
        modelId,
        apiKeyId: key.id,
        enablePbr: true,
        faceCount: 1_000_000,
        prompt: 'source prompt',
      })

      const [job] = await jobsOfMe()
      expect(result).toEqual({ jobId: job!.id, requestId: job!.id })
      expect(job).toMatchObject({ status: 'RUNNING', modelId })
      expect(metaOf(job!)).toMatchObject({
        workerDispatched: true,
        outputType: 'MODEL_3D',
        sourceImageUrl: SOURCE,
        prompt: 'source prompt',
        apiKeyId: key.id,
      })
      expect(runRequests()).toHaveLength(1)
      expect(runRequests()[0]!.json).toMatchObject({
        runId: job!.id,
        workflowId: 'HUNYUAN3D',
        outputType: 'MODEL_3D',
        userId: me.id,
        providerInput: {
          imageUrl: SOURCE,
          modelId,
          enablePbr: true,
          faceCount: 1_000_000,
        },
      })
    },
  )

  it('非正方形的源图：补白成正方形另存，Worker 拿到的是处理后的那张', async () => {
    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.FAL)
    await hostPng(SOURCE, 1600, 1200)

    await submit3DGeneration(me.clerkId, {
      imageUrl: SOURCE,
      modelId: AI_MODELS.HUNYUAN3D_V31_PRO,
    })

    const sent = runRequests()[0]!.json as {
      providerInput: { imageUrl: string }
    }
    expect(sent.providerInput.imageUrl).not.toBe(SOURCE)
    expect(sent.providerInput.imageUrl.startsWith(`${FAKE_CDN}/`)).toBe(true)
    const [job] = await jobsOfMe()
    expect(metaOf(job!).sourceImageUrl).toBe(SOURCE)
  })

  it('源图太小：422 说清楚，⛔ 建任务', async () => {
    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.FAL)
    await hostPng(SOURCE, 300, 300)

    await expect(
      submit3DGeneration(me.clerkId, {
        imageUrl: SOURCE,
        modelId: AI_MODELS.HUNYUAN3D_V31_PRO,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', status: 422 })
    expect(await jobsOfMe()).toEqual([])
    expect(worker.requests).toEqual([])
  })

  it('Worker 收没收到不知道（5xx）：任务留着照常交回，⛔ 判失败', async () => {
    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.FAL)
    worker.reject(502)

    const result = await submit3DGeneration(me.clerkId, {
      imageUrl: SOURCE,
      modelId: AI_MODELS.HUNYUAN3D_V31_PRO,
    })

    const [job] = await jobsOfMe()
    expect(result.jobId).toBe(job!.id)
    expect(job!.status).toBe('RUNNING')
  })

  it('回调要用的来源没写进库：⛔ 派发，任务判失败', async () => {
    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.FAL)
    vi.spyOn(db.generationJob, 'update').mockRejectedValueOnce(
      new Error('database write failed'),
    )

    await expect(
      submit3DGeneration(me.clerkId, {
        imageUrl: SOURCE,
        modelId: AI_MODELS.HUNYUAN3D_V31_PRO,
      }),
    ).rejects.toThrow('database write failed')

    expect(runRequests()).toEqual([])
    const [job] = await jobsOfMe()
    expect(job).toMatchObject({
      status: 'FAILED',
      errorMessage: 'database write failed',
    })
  })
})

describe('check3DGenerationStatusForUserId', () => {
  function seedJob(
    data: Partial<{
      userId: string
      status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
      errorMessage: string
      externalRequestId: string
      generationId: string
      providerJobId: string
      updatedAt: Date
    }> = {},
  ) {
    return db.generationJob.create({
      data: {
        userId: me.id,
        adapterType: AI_ADAPTER_TYPES.FAL,
        provider: 'fal',
        modelId: AI_MODELS.HUNYUAN3D_V31_PRO,
        status: 'RUNNING',
        startedAt: new Date(),
        externalRequestId: JSON.stringify({
          workerDispatched: true,
          outputType: 'MODEL_3D',
          sourceImageUrl: SOURCE,
          prompt: '',
        }),
        ...data,
      },
    })
  }

  it('Worker 在跑：IN_PROGRESS；别人的任务 404', async () => {
    const job = await seedJob()
    const other = await createTestUser()

    expect(await check3DGenerationStatusForUserId(me.id, job.id)).toEqual({
      jobId: job.id,
      status: 'IN_PROGRESS',
    })
    await expect(
      check3DGenerationStatusForUserId(other.id, job.id),
    ).rejects.toMatchObject({ code: 'JOB_NOT_FOUND', status: 404 })
  })

  it('出好了：交回模型作品', async () => {
    const generation = await seedGeneration(me.id, {
      outputType: 'MODEL_3D',
      modelUrl: `${FAKE_CDN}/model.glb`,
    })
    const job = await seedJob({
      status: 'COMPLETED',
      generationId: generation.id,
    })

    expect(await check3DGenerationStatusForUserId(me.id, job.id)).toMatchObject(
      {
        status: 'COMPLETED',
        generation: { id: generation.id, modelUrl: `${FAKE_CDN}/model.glb` },
      },
    )
  })

  it('Worker 崩了没回执、超过期限：读的时候判失败（回执超时），任务行同步改', async () => {
    const job = await seedJob()
    await db.$executeRaw`UPDATE "GenerationJob" SET "updatedAt" = NOW() - INTERVAL '2 days' WHERE id = ${job.id}`

    const result = await check3DGenerationStatusForUserId(me.id, job.id)

    expect(result).toMatchObject({
      status: 'FAILED',
      errorCode: GENERATION_ERROR_CODES.CALLBACK_TIMEOUT,
    })
    expect(
      (await db.generationJob.findUniqueOrThrow({ where: { id: job.id } }))
        .status,
    ).toBe('FAILED')
  })

  it('取消了：CANCELLED；失败了：交回原话', async () => {
    const cancelled = await seedJob({ status: 'CANCELLED' })
    const failed = await seedJob({
      status: 'FAILED',
      errorMessage: 'Rodin generation failed with status 400',
    })

    expect(
      await check3DGenerationStatusForUserId(me.id, cancelled.id),
    ).toMatchObject({ status: 'CANCELLED' })
    const result = await check3DGenerationStatusForUserId(me.id, failed.id)
    expect(result).toMatchObject({
      status: 'FAILED',
      error: 'Rodin generation failed with status 400',
    })
    expect(result).not.toHaveProperty('cancelled')
  })

  it('源图尺寸类失败：按 3D 自己的 sourceImageUrl 判有没有参考图', async () => {
    const withSource = await seedJob({
      status: 'FAILED',
      errorMessage: 'the source image aspect ratio is not supported',
    })
    const textOnly = await seedJob({
      status: 'FAILED',
      errorMessage: 'the source image aspect ratio is not supported',
      externalRequestId: JSON.stringify({
        workerDispatched: true,
        prompt: 'a low poly fox',
      }),
    })

    expect(
      await check3DGenerationStatusForUserId(me.id, withSource.id),
    ).toMatchObject({
      hasReferenceImage: true,
      errorCode: 'invalid_reference_image_dimensions',
    })
    const text = await check3DGenerationStatusForUserId(me.id, textOnly.id)
    expect(text).toMatchObject({ hasReferenceImage: false })
    expect((text as { errorCode?: string }).errorCode).not.toBe(
      'invalid_reference_image_dimensions',
    )
  })

  it('没有 workerDispatched 的老任务（Worker 之前的直连队列）：不支持', async () => {
    const job = await seedJob({
      externalRequestId: JSON.stringify({
        requestId: 'req-1',
        statusUrl: 'https://queue.fal.run/status/req-1',
        responseUrl: 'https://queue.fal.run/result/req-1',
        sourceImageUrl: SOURCE,
      }),
    })

    await expect(
      check3DGenerationStatusForUserId(me.id, job.id),
    ).rejects.toThrow('3D status check is not supported for this provider')
  })
})

describe('分段出模（直连 fal 那条已下线）', () => {
  it('continue / retry-mesh：没有任务 404，不在 MESH_READY 400，停在 MESH_READY 也走不通', async () => {
    await expect(
      continue3DGenerationForUserId(me.id, { jobId: 'missing' }),
    ).rejects.toMatchObject({ status: 404 })

    const running = await db.generationJob.create({
      data: {
        userId: me.id,
        adapterType: AI_ADAPTER_TYPES.FAL,
        provider: 'fal',
        modelId: AI_MODELS.HUNYUAN3D_V31_PRO,
        status: 'RUNNING',
        externalRequestId: JSON.stringify({
          stage: MODEL_3D_JOB_STAGE.MESH_RUNNING,
        }),
      },
    })
    await expect(
      continue3DGenerationForUserId(me.id, { jobId: running.id }),
    ).rejects.toMatchObject({ status: 400 })

    await db.generationJob.update({
      where: { id: running.id },
      data: {
        externalRequestId: JSON.stringify({
          stage: MODEL_3D_JOB_STAGE.MESH_READY,
          sourceImageUrl: SOURCE,
        }),
      },
    })
    await expect(
      continue3DGenerationForUserId(me.id, { jobId: running.id }),
    ).rejects.toThrow('3D generation is not supported for this provider')
    await expect(
      retryMesh3DGenerationForUserId(me.id, { jobId: running.id }),
    ).rejects.toThrow('3D generation is not supported for this provider')
  })
})

describe('cancel3DGenerationForUserId', () => {
  async function runningJob(providerJobId?: string) {
    return db.generationJob.create({
      data: {
        userId: me.id,
        adapterType: AI_ADAPTER_TYPES.FAL,
        provider: 'fal',
        modelId: AI_MODELS.HUNYUAN3D_V31_PRO,
        status: 'RUNNING',
        startedAt: new Date(),
        providerJobId: providerJobId ?? null,
        externalRequestId: JSON.stringify({
          workerDispatched: true,
          sourceImageUrl: SOURCE,
        }),
      },
    })
  }
  const cancelNotices = () =>
    worker.requests.filter((r) => r.path === EXECUTION_WORKER.CANCEL_PATH)

  it('在跑的任务：落 CANCELLED，并通知 Worker 停（带服务商任务号）', async () => {
    const job = await runningJob('fal-req-123')

    const result = await cancel3DGenerationForUserId(me.id, { jobId: job.id })

    expect(result).toMatchObject({ jobId: job.id, status: 'CANCELLED' })
    expect(
      (await db.generationJob.findUniqueOrThrow({ where: { id: job.id } }))
        .status,
    ).toBe('CANCELLED')
    expect(cancelNotices().map((r) => r.json)).toEqual([
      {
        jobId: job.id,
        workflowInstanceId: job.id,
        provider: 'fal',
        providerJobId: 'fal-req-123',
      },
    ])
  })

  it('Worker 通知失败也照样取消（尽力而为）', async () => {
    const job = await runningJob()
    worker.reject(500)

    await expect(
      cancel3DGenerationForUserId(me.id, { jobId: job.id }),
    ).resolves.toMatchObject({ status: 'CANCELLED' })
    expect(cancelNotices()[0]!.json).not.toHaveProperty('providerJobId')
  })

  it('已经结束的：不再改、⛔ 通知 Worker；已完成的拒取消', async () => {
    const job = await runningJob()
    await cancel3DGenerationForUserId(me.id, { jobId: job.id })
    worker.requests.length = 0

    await expect(
      cancel3DGenerationForUserId(me.id, { jobId: job.id }),
    ).resolves.toMatchObject({ status: 'CANCELLED' })
    expect(cancelNotices()).toEqual([])

    const generation = await seedGeneration(me.id)
    await db.generationJob.update({
      where: { id: job.id },
      data: { status: 'COMPLETED', generationId: generation.id },
    })
    await expect(
      cancel3DGenerationForUserId(me.id, { jobId: job.id }),
    ).rejects.toMatchObject({ code: 'INVALID_JOB', status: 400 })
  })
})
