/**
 * L2a 真库：语音任务的状态轮询（`checkAudioGenerationStatus`）。
 * Worker 管的任务只读库；老的 fal 队列（库里配的 F5-TTS）整条真跑：提交进 outbox →
 * 第一次轮询认领 outbox 去排队 → 再轮询拿到结果落库。只假边界：服务商（fetch）、R2 的真 I/O。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/services/storage/r2', async (importOriginal) =>
  (await import('@/test/int/fake-r2')).fakeR2Module(await importOriginal()),
)

import { EXECUTION_OUTBOX_KINDS } from '@/constants/execution'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { db } from '@/lib/db'
import {
  checkAudioGenerationStatus,
  submitAudioGeneration,
} from '@/services/generate-audio.service'
import { uploadToR2 } from '@/services/storage/r2'
import { createTestUser, resetDatabase, seedAssistantKey } from '@/test/int/db'
import {
  FAKE_AUDIO_BYTES,
  FAL_AUDIO_RESULT_URL,
  FAL_QUEUE_RESULT_URL,
  FAL_QUEUE_STATUS_URL,
  installFakeAudioProviders,
  type FakeAudioProviders,
} from '@/test/int/fake-audio-providers'
import { fakeBucket } from '@/test/int/fake-r2'
import { seedGeneration } from '@/test/int/seed-generation'

// 型号 id 故意与执行端点不同：老队列提交要按库里配的 externalModelId 打端点
// （11-04 修：原来只认 `getExecutionModelId(modelId)`，id 不同就打错端点）。
const F5 = 'f5-tts-db'
const FAL_ROUTE_CONFIG = { label: 'fal.ai', baseUrl: 'https://queue.fal.run' }

let me: Awaited<ReturnType<typeof createTestUser>>
let providers: FakeAudioProviders

beforeEach(async () => {
  await resetDatabase()
  fakeBucket.reset()
  me = await createTestUser()
  providers = installFakeAudioProviders()
  fakeBucket.remote.set(FAL_AUDIO_RESULT_URL, {
    buffer: FAKE_AUDIO_BYTES,
    mimeType: 'audio/mpeg',
  })
  await db.modelConfig.create({
    data: {
      modelId: F5,
      externalModelId: 'fal-ai/f5-tts',
      adapterType: AI_ADAPTER_TYPES.FAL,
      outputType: 'AUDIO',
      providerConfig: FAL_ROUTE_CONFIG,
    },
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function seedJob(
  data: Partial<{
    userId: string
    status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
    errorMessage: string
    externalRequestId: string
    generationId: string
    startedAt: Date
  }> = {},
) {
  return db.generationJob.create({
    data: {
      userId: me.id,
      adapterType: AI_ADAPTER_TYPES.FAL,
      provider: 'fal.ai',
      modelId: F5,
      prompt: 'Hello world',
      status: 'RUNNING',
      startedAt: new Date(),
      ...data,
    },
  })
}

/** 老队列任务上记的路由（与提交时 `buildAudioRouteIdentity` 同形）。 */
const legacyRoute = (overrides: Record<string, unknown> = {}) => ({
  modelId: F5,
  adapterType: AI_ADAPTER_TYPES.FAL,
  provider: 'fal.ai',
  providerConfig: FAL_ROUTE_CONFIG,
  apiKeyId: null,
  isFreeGeneration: false,
  ...overrides,
})

const readJob = (id: string) =>
  db.generationJob.findUniqueOrThrow({ where: { id } })

describe('checkAudioGenerationStatus · 只读库', () => {
  it('没有这个任务 / 别人的任务：404', async () => {
    const other = await createTestUser()
    const theirs = await seedJob({ userId: other.id, status: 'CANCELLED' })

    for (const id of ['missing-job', theirs.id]) {
      await expect(
        checkAudioGenerationStatus(me.clerkId, id),
      ).rejects.toMatchObject({ code: 'JOB_NOT_FOUND', status: 404 })
    }
  })

  it('已完成：交回那条作品，⛔ 打服务商', async () => {
    const generation = await seedGeneration(me.id, { outputType: 'AUDIO' })
    const job = await seedJob({
      status: 'COMPLETED',
      generationId: generation.id,
    })

    expect(await checkAudioGenerationStatus(me.clerkId, job.id)).toMatchObject({
      status: 'COMPLETED',
      generation: { id: generation.id },
    })
    expect(providers.calls).toEqual([])
  })

  it('失败：交回原话并按原话分类（余额不足）', async () => {
    const job = await seedJob({
      status: 'FAILED',
      errorMessage: 'Fish Audio quota exhausted',
    })

    expect(await checkAudioGenerationStatus(me.clerkId, job.id)).toEqual({
      jobId: job.id,
      status: 'FAILED',
      error: 'Fish Audio quota exhausted',
      errorCode: 'provider_insufficient_balance',
      i18nKey: 'errors.provider.insufficientBalance',
      hasReferenceImage: false,
    })
  })

  it('Worker 管的任务在跑：IN_PROGRESS，⛔ 打服务商', async () => {
    const job = await seedJob({
      externalRequestId: JSON.stringify({
        workerManaged: true,
        outputType: 'AUDIO',
        workflowInstanceId: 'wf-audio-1',
        route: legacyRoute({ adapterType: AI_ADAPTER_TYPES.FISH_AUDIO }),
      }),
    })

    expect(await checkAudioGenerationStatus(me.clerkId, job.id)).toEqual({
      jobId: job.id,
      status: 'IN_PROGRESS',
    })
    expect(providers.calls).toEqual([])
  })

  it('Worker 管的任务跑了两小时没回执：就地判失败（回执超时）并落库', async () => {
    const job = await seedJob({
      startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      externalRequestId: JSON.stringify({
        workerManaged: true,
        outputType: 'AUDIO',
        workflowInstanceId: 'wf-audio-1',
      }),
    })

    expect(await checkAudioGenerationStatus(me.clerkId, job.id)).toMatchObject({
      status: 'FAILED',
      errorCode: 'callback_timeout',
    })
    expect((await readJob(job.id)).status).toBe('FAILED')
  })
})

describe('checkAudioGenerationStatus · 老的 fal 队列整条', () => {
  async function submitF5() {
    const fal = await seedAssistantKey(me.id, AI_ADAPTER_TYPES.FAL)
    const { jobId } = await submitAudioGeneration(me.clerkId, {
      prompt: 'Hello world',
      modelId: F5,
      apiKeyId: fal.id,
      referenceAudioUrl: 'https://cdn.example.com/reference.wav',
      referenceText: 'Reference transcript',
    })
    return jobId
  }

  it('第一次轮询认领 outbox 去排队，再轮询拿到结果：落作品、任务完成、用量挂上', async () => {
    const jobId = await submitF5()

    const first = await checkAudioGenerationStatus(me.clerkId, jobId)

    expect(first).toEqual({ jobId, status: 'IN_PROGRESS' })
    const submitted = providers.callsTo('fal-queue-submit')
    expect(submitted).toHaveLength(1)
    expect(submitted[0]!.url).toBe('https://queue.fal.run/fal-ai/f5-tts')
    expect(submitted[0]!.json).toMatchObject({
      gen_text: 'Hello world',
      ref_audio_url: 'https://cdn.example.com/reference.wav',
      ref_text: 'Reference transcript',
    })
    const [outbox] = await db.executionOutbox.findMany({
      where: { kind: EXECUTION_OUTBOX_KINDS.AUDIO_QUEUE_SUBMIT },
    })
    expect(outbox).toMatchObject({
      status: 'COMPLETED',
      result: expect.objectContaining({ requestId: 'req-1' }),
    })
    expect(JSON.parse((await readJob(jobId)).externalRequestId!)).toMatchObject(
      { requestId: 'req-1', statusUrl: FAL_QUEUE_STATUS_URL },
    )

    providers.reply('fal-queue-status', () =>
      Response.json({ status: 'COMPLETED' }),
    )
    const second = await checkAudioGenerationStatus(me.clerkId, jobId)

    const generation = await db.generation.findFirstOrThrow({
      where: { userId: me.id },
    })
    expect(second).toMatchObject({
      status: 'COMPLETED',
      generation: { id: generation.id },
    })
    expect(providers.callsTo('fal-queue-result')[0]!.url).toBe(
      FAL_QUEUE_RESULT_URL,
    )
    expect(generation).toMatchObject({
      outputType: 'AUDIO',
      prompt: 'Hello world',
      model: F5,
      isFreeGeneration: false,
    })
    expect(fakeBucket.objects.get(generation.storageKey)).toEqual(
      FAKE_AUDIO_BYTES,
    )
    expect(await readJob(jobId)).toMatchObject({
      status: 'COMPLETED',
      generationId: generation.id,
    })
    expect(
      await db.apiUsageLedger.findMany({ where: { generationJobId: jobId } }),
    ).toEqual([
      expect.objectContaining({
        generationId: generation.id,
        modelId: F5,
        wasSuccessful: true,
      }),
    ])

    // 再轮询：读库里的结果，⛔ 再打服务商。
    const before = providers.calls.length
    await expect(
      checkAudioGenerationStatus(me.clerkId, jobId),
    ).resolves.toMatchObject({ status: 'COMPLETED' })
    expect(providers.calls).toHaveLength(before)
  })

  it('服务商说失败：任务判失败、交回原因', async () => {
    const jobId = await submitF5()
    providers.reply('fal-queue-status', () =>
      Response.json({ status: 'FAILED', error: 'reference audio too short' }),
    )

    const result = await checkAudioGenerationStatus(me.clerkId, jobId)

    expect(result).toMatchObject({ status: 'FAILED' })
    expect((await readJob(jobId)).status).toBe('FAILED')
  })

  it('另一次轮询已经在落库：交回 IN_PROGRESS，⛔ 落第二条作品', async () => {
    const jobId = await submitF5()
    await checkAudioGenerationStatus(me.clerkId, jobId)
    providers.reply('fal-queue-status', async () => {
      // 这次查状态的同时，另一次轮询抢先认领了落库。
      await db.generationJob.update({
        where: { id: jobId },
        data: { status: 'QUEUED' },
      })
      return Response.json({ status: 'COMPLETED' })
    })

    const result = await checkAudioGenerationStatus(me.clerkId, jobId)

    expect(result).toEqual({ jobId, status: 'IN_PROGRESS' })
    expect(await db.generation.count()).toBe(0)
  })

  it('转存失败：任务判失败、⛔ 记成功用量', async () => {
    const jobId = await submitF5()
    await checkAudioGenerationStatus(me.clerkId, jobId)
    providers.reply('fal-queue-status', () =>
      Response.json({ status: 'COMPLETED' }),
    )
    vi.mocked(uploadToR2).mockRejectedValueOnce(new Error('R2 unavailable'))

    await expect(checkAudioGenerationStatus(me.clerkId, jobId)).rejects.toThrow(
      'R2 unavailable',
    )
    expect(await readJob(jobId)).toMatchObject({
      status: 'FAILED',
      errorMessage: 'R2 unavailable',
    })
    expect(
      await db.apiUsageLedger.count({ where: { wasSuccessful: true } }),
    ).toBe(0)
  })

  it('平台出钱的免费档：用平台 key 查、作品记成免费', async () => {
    vi.stubEnv('FAL_API_KEY', 'platform-fal-key')
    const job = await seedJob({
      externalRequestId: JSON.stringify({
        requestId: 'req-1',
        statusUrl: FAL_QUEUE_STATUS_URL,
        responseUrl: FAL_QUEUE_RESULT_URL,
        route: legacyRoute({ isFreeGeneration: true }),
      }),
    })
    providers.reply('fal-queue-status', () =>
      Response.json({ status: 'COMPLETED' }),
    )

    await checkAudioGenerationStatus(me.clerkId, job.id)

    expect(
      providers.callsTo('fal-queue-status')[0]!.headers.get('authorization'),
    ).toBe('Key platform-fal-key')
    expect(
      (await db.generation.findFirstOrThrow({ where: { userId: me.id } }))
        .isFreeGeneration,
    ).toBe(true)
  })

  it('outbox 租约过期、排队信息还没写回：任务与 outbox 都判失败', async () => {
    const job = await seedJob({
      externalRequestId: JSON.stringify({ route: legacyRoute() }),
    })
    const outbox = await db.executionOutbox.create({
      data: {
        generationJobId: job.id,
        kind: EXECUTION_OUTBOX_KINDS.AUDIO_QUEUE_SUBMIT,
        status: 'PROCESSING',
        payload: { prompt: 'Hello world' },
        leaseExpiresAt: new Date(Date.now() - 60 * 60 * 1000),
      },
    })

    expect(await checkAudioGenerationStatus(me.clerkId, job.id)).toMatchObject({
      status: 'FAILED',
    })
    expect(await readJob(job.id)).toMatchObject({
      status: 'FAILED',
      errorMessage:
        'Audio execution lease expired before queue metadata was persisted',
    })
    expect(
      (await db.executionOutbox.findUniqueOrThrow({ where: { id: outbox.id } }))
        .status,
    ).toBe('FAILED')
    expect(providers.calls).toEqual([])
  })

  it('排队信息没有、也没有 outbox 可补：判失败', async () => {
    const job = await seedJob({
      externalRequestId: JSON.stringify({ route: legacyRoute() }),
    })

    expect(await checkAudioGenerationStatus(me.clerkId, job.id)).toMatchObject({
      status: 'FAILED',
    })
    expect((await readJob(job.id)).errorMessage).toBe(
      'Audio queue request metadata is unavailable',
    )
  })
})
