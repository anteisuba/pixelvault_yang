/**
 * L2a 真库 + 真提交链路：语音提交的分流（Fish 派给执行 Worker / 本机直连兜底 / 老的 fal 队列进 outbox）。
 * 只假边界：执行 Worker 与服务商（fetch）、R2 的真 I/O。核任务行、outbox 行、派给 Worker 的东西。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/services/storage/r2', async (importOriginal) =>
  (await import('@/test/int/fake-r2')).fakeR2Module(await importOriginal()),
)

import { EXPRESSIVENESS_TO_FISH_TEMPERATURE } from '@/constants/audio-options'
import { EXECUTION_OUTBOX_KINDS } from '@/constants/execution'
import { AI_MODELS } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { db } from '@/lib/db'
import { submitAudioGeneration } from '@/services/generate-audio.service'
import { createTestUser, resetDatabase, seedAssistantKey } from '@/test/int/db'
import {
  installFakeAudioProviders,
  type FakeAudioProviders,
} from '@/test/int/fake-audio-providers'
import { fakeBucket } from '@/test/int/fake-r2'
import type { GenerateAudioRequest } from '@/types'

let me: Awaited<ReturnType<typeof createTestUser>>
let providers: FakeAudioProviders
let fishKeyId: string

const SPEECH: GenerateAudioRequest = {
  prompt: 'Hello world',
  modelId: AI_MODELS.FISH_AUDIO_S2_PRO,
  voiceId: 'voice-1',
}

type Dispatched = Record<string, unknown> & {
  providerInput: Record<string, unknown>
}
const dispatched = (): Dispatched => {
  expect(providers.worker.requests).toHaveLength(1)
  return providers.worker.requests[0]!.json as Dispatched
}
async function onlyJob() {
  const jobs = await db.generationJob.findMany({ where: { userId: me.id } })
  expect(jobs).toHaveLength(1)
  return jobs[0]!
}
const queueSubmitOutboxes = () =>
  db.executionOutbox.findMany({
    where: { kind: EXECUTION_OUTBOX_KINDS.AUDIO_QUEUE_SUBMIT },
  })

beforeEach(async () => {
  await resetDatabase()
  fakeBucket.reset()
  me = await createTestUser()
  fishKeyId = (await seedAssistantKey(me.id, AI_ADAPTER_TYPES.FISH_AUDIO)).id
  providers = installFakeAudioProviders({ workerInstanceId: 'wf-audio-1' })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('submitAudioGeneration · Fish 派给执行 Worker', () => {
  it.each([
    [AI_MODELS.FISH_AUDIO_S2_PRO, 's2.1-pro'],
    [AI_MODELS.FISH_AUDIO_S2_PRO_FREE, 's2.1-pro-free'],
  ])(
    '%s：按选的档派发（执行 id %s），⛔ 进老队列 outbox',
    async (modelId, externalModelId) => {
      const result = await submitAudioGeneration(me.clerkId, {
        ...SPEECH,
        modelId,
        format: 'mp3',
        withTimestamps: true,
        temperature: 0.8,
      })

      const job = await onlyJob()
      expect(result).toEqual({ jobId: job.id, requestId: 'wf-audio-1' })
      expect(dispatched()).toMatchObject({
        runId: job.id,
        outputType: 'AUDIO',
        providerId: AI_ADAPTER_TYPES.FISH_AUDIO,
        apiKeyId: fishKeyId,
        providerInput: {
          externalModelId,
          voiceId: 'voice-1',
          format: 'mp3',
          withTimestamps: true,
          temperature: 0.8,
          providerBaseUrl: 'https://api.fish.audio',
          outputStorageKey: expect.stringMatching(
            new RegExp(`^generations/.*${me.id}`),
          ),
        },
      })
      expect(providers.worker.requests[0]!.body).not.toContain(
        'sk-test-not-a-real-key',
      )
      expect(JSON.parse(job.externalRequestId!)).toMatchObject({
        workerManaged: true,
        workflowInstanceId: 'wf-audio-1',
      })
      expect(await queueSubmitOutboxes()).toEqual([])
      expect(providers.calls).toEqual([])
    },
  )

  it('Fish 没公布字数上限：两万字照收', async () => {
    await submitAudioGeneration(me.clerkId, {
      ...SPEECH,
      prompt: 'a'.repeat(20_000),
    })

    expect(dispatched().providerInput.prompt).toHaveLength(20_000)
  })

  /**
   * ⭐ 表现力必须**在服务端折算成 temperature** 再交给 Worker（2026-08-30 审计：原先透传
   * `request.temperature`，四档表现力点了等于没点）。界面上看不出来，只有断言派发内容锁得住。
   */
  it.each([
    [
      { expressiveness: 'restrained' },
      EXPRESSIVENESS_TO_FISH_TEMPERATURE.restrained,
    ],
    // 有情绪、表现力 auto → 按情绪推成 dramatic，与同步路径同一条推导。
    [
      { emotion: 'whisper', expressiveness: 'auto' },
      EXPRESSIVENESS_TO_FISH_TEMPERATURE.dramatic,
    ],
  ] as const)('表现力 %o → temperature %s', async (patch, temperature) => {
    await submitAudioGeneration(me.clerkId, { ...SPEECH, ...patch })

    expect(dispatched().providerInput.temperature).toBe(temperature)
  })

  it('没给音色也没给参考音频：400，⛔ 建任务、⛔ 派发', async () => {
    await expect(
      submitAudioGeneration(me.clerkId, {
        prompt: 'Hello world',
        modelId: AI_MODELS.FISH_AUDIO_S2_PRO,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', status: 400 })
    expect(await db.generationJob.count()).toBe(0)
    expect(providers.worker.requests).toEqual([])
  })

  it('Worker 收没收到不知道（断网）：任务留着，jobId 照常交回（配音间才记得住这条台词）', async () => {
    vi.mocked(fetch).mockImplementation(async () => {
      throw new TypeError('fetch failed')
    })

    const result = await submitAudioGeneration(me.clerkId, SPEECH)

    const job = await onlyJob()
    expect(result).toEqual({ jobId: job.id, requestId: job.id })
    expect(job.status).toBe('RUNNING')
  })

  it('Worker 已收下、回写实例号失败：⛔ 把收下的任务判失败', async () => {
    const update = db.generationJob.update.bind(db.generationJob)
    let failedOnce = false
    vi.spyOn(db.generationJob, 'update').mockImplementation(((
      args: Parameters<typeof update>[0],
    ) => {
      const data = args.data as { externalRequestId?: unknown }
      if (
        !failedOnce &&
        typeof data.externalRequestId === 'string' &&
        data.externalRequestId.includes('wf-audio-1')
      ) {
        failedOnce = true
        return Promise.reject(new Error('database write failed'))
      }
      return update(args)
    }) as unknown as typeof update)

    await expect(submitAudioGeneration(me.clerkId, SPEECH)).resolves.toEqual({
      jobId: expect.any(String),
      requestId: 'wf-audio-1',
    })
    expect(failedOnce).toBe(true)
    expect((await onlyJob()).status).toBe('RUNNING')
  })

  it('本机开发、Worker 指向本机回环：直连 Fish 当场出声，⛔ 派发', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('EXECUTION_WORKER_BASE_URL', 'http://127.0.0.1:8787')

    const result = await submitAudioGeneration(me.clerkId, SPEECH)

    expect(providers.callsTo('fish')).toHaveLength(1)
    expect(providers.worker.requests).toEqual([])
    const job = await db.generationJob.findUniqueOrThrow({
      where: { id: result.jobId },
    })
    expect(job.status).toBe('COMPLETED')
  })
})

describe('submitAudioGeneration · 老的 fal 队列（库里配的 F5-TTS）', () => {
  beforeEach(async () => {
    await db.modelConfig.create({
      data: {
        modelId: 'f5-tts-db',
        externalModelId: 'fal-ai/f5-tts',
        adapterType: AI_ADAPTER_TYPES.FAL,
        outputType: 'AUDIO',
        providerConfig: { label: 'fal.ai', baseUrl: 'https://queue.fal.run' },
      },
    })
  })

  it('进执行 outbox 等第一次轮询再提交：任务上记好路由，⛔ 当场打服务商、⛔ 派 Worker', async () => {
    const fal = await seedAssistantKey(me.id, AI_ADAPTER_TYPES.FAL)

    const result = await submitAudioGeneration(me.clerkId, {
      prompt: 'Hello world',
      modelId: 'f5-tts-db',
      apiKeyId: fal.id,
      referenceAudioUrl: 'https://cdn.example.com/reference.wav',
    })

    const job = await onlyJob()
    expect(result).toEqual({ jobId: job.id })
    expect(job).toMatchObject({ modelId: 'f5-tts-db', prompt: 'Hello world' })
    expect(JSON.parse(job.externalRequestId!)).toMatchObject({
      route: {
        adapterType: AI_ADAPTER_TYPES.FAL,
        apiKeyId: fal.id,
        providerConfig: expect.any(Object),
      },
    })
    const outboxes = await queueSubmitOutboxes()
    expect(outboxes).toHaveLength(1)
    expect(outboxes[0]).toMatchObject({
      generationJobId: job.id,
      status: 'PENDING',
      payload: expect.objectContaining({
        prompt: 'Hello world',
        referenceAudioUrl: 'https://cdn.example.com/reference.wav',
      }),
    })
    expect(providers.calls).toEqual([])
    expect(providers.worker.requests).toEqual([])
  })

  it('这家既不能当场出声、也不能排队：400，⛔ 建任务', async () => {
    await db.modelConfig.create({
      data: {
        modelId: 'replicate-audio-db',
        externalModelId: 'someone/tts',
        adapterType: AI_ADAPTER_TYPES.REPLICATE,
        outputType: 'AUDIO',
        providerConfig: {
          label: 'Replicate',
          baseUrl: 'https://api.replicate.com',
        },
      },
    })
    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.REPLICATE)

    await expect(
      submitAudioGeneration(me.clerkId, {
        prompt: 'Hello world',
        modelId: 'replicate-audio-db',
      }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_MODEL', status: 400 })
    expect(await db.generationJob.count()).toBe(0)
    expect(await db.executionOutbox.count()).toBe(0)
  })
})
