/**
 * L2a 真库：视频 / 语音结果回执落库（转存 R2 → 作品 + 任务完成 + 用量一个事务）。
 * 只假 R2 的真 I/O；核 Generation、GenerationJob、ApiUsageLedger 三张表。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/services/storage/r2', async (importOriginal) =>
  (await import('@/test/int/fake-r2')).fakeR2Module(await importOriginal()),
)

import { db } from '@/lib/db'
import { createTestUser, resetDatabase } from '@/test/int/db'
import { seedJob, sendCallback } from '@/test/int/execution-callback'
import { FAKE_CDN, fakeBucket } from '@/test/int/fake-r2'

let me: Awaited<ReturnType<typeof createTestUser>>

const PROVIDER_VIDEO = 'https://provider.example.com/video.mp4'
const PROVIDER_THUMB = 'https://provider.example.com/thumbnail.jpg'
const PROVIDER_AUDIO = 'https://provider.example.com/audio.wav'

async function onlyGeneration() {
  const rows = await db.generation.findMany({ where: { userId: me.id } })
  expect(rows).toHaveLength(1)
  return rows[0]!
}

beforeEach(async () => {
  await resetDatabase()
  fakeBucket.reset()
  me = await createTestUser()
  fakeBucket.remote.set(PROVIDER_VIDEO, {
    buffer: Buffer.alloc(1024, 1),
    mimeType: 'video/mp4',
  })
  fakeBucket.remote.set(PROVIDER_AUDIO, {
    buffer: Buffer.alloc(2048, 2),
    mimeType: 'audio/wav',
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('handleExecutionCallback · 视频', () => {
  it('从服务商转存进 R2，作品 / 任务 / 用量一起落库，回执原文进快照', async () => {
    const job = await seedJob(me.id, {
      metadata: {
        referenceImageUrl: 'https://example.com/reference.png',
        providerMetadata: { requestId: 'request-1' },
      },
    })

    const result = await sendCallback(job.id, 'result', {
      artifactUrl: PROVIDER_VIDEO,
      providerMetadata: { requestId: 'request-1', seed: 123 },
      width: 1280,
      height: 720,
      duration: 5,
      requestCount: 1,
    })

    expect(result).toEqual({
      runId: job.id,
      jobStatus: 'COMPLETED',
      action: 'completed',
    })
    const generation = await onlyGeneration()
    expect(fakeBucket.uploads).toEqual([generation.storageKey])
    expect(generation).toMatchObject({
      outputType: 'VIDEO',
      url: `${FAKE_CDN}/${generation.storageKey}`,
      mimeType: 'video/mp4',
      width: 1280,
      height: 720,
      duration: 5,
      prompt: 'cinematic prompt',
      model: 'kling-video',
      provider: 'fal.ai',
      referenceImageUrl: 'https://example.com/reference.png',
      // 没给缩略图：不硬造海报。
      thumbnailUrl: null,
    })
    expect(generation.snapshot).toMatchObject({
      executionCallback: {
        artifactUrl: PROVIDER_VIDEO,
        providerMetadata: { requestId: 'request-1', seed: 123 },
      },
    })
    expect(
      await db.generationJob.findUniqueOrThrow({ where: { id: job.id } }),
    ).toMatchObject({
      status: 'COMPLETED',
      generationId: generation.id,
      requestCount: 1,
    })
    const ledger = await db.apiUsageLedger.findMany()
    expect(ledger).toEqual([
      expect.objectContaining({
        generationId: generation.id,
        generationJobId: job.id,
        inputImageCount: 1,
        outputImageCount: 0,
        width: 1280,
        wasSuccessful: true,
      }),
    ])
  })

  it('Worker 给了缩略图：做成作品海报', async () => {
    fakeBucket.remote.set(PROVIDER_THUMB, {
      buffer: Buffer.from('jpg'),
      mimeType: 'image/jpeg',
    })
    const job = await seedJob(me.id)

    await sendCallback(job.id, 'result', {
      artifactUrl: PROVIDER_VIDEO,
      thumbnailUrl: PROVIDER_THUMB,
      requestCount: 1,
    })

    const generation = await onlyGeneration()
    expect(generation).toMatchObject({
      thumbnailStorageKey: `${generation.storageKey}.thumbnail.webp`,
      thumbnailUrl: `${FAKE_CDN}/${generation.storageKey}.thumbnail.webp`,
    })
  })

  it('海报做不出来：作品照样落库，只是没海报', async () => {
    const job = await seedJob(me.id)

    const result = await sendCallback(job.id, 'result', {
      artifactUrl: PROVIDER_VIDEO,
      thumbnailUrl: 'https://provider.example.com/missing.jpg',
    })

    expect(result.action).toBe('completed')
    expect((await onlyGeneration()).thumbnailUrl).toBeNull()
  })

  it('Worker 已自己传进 R2：⛔ 再转存，存 Worker 的 key 与服务商种子', async () => {
    const job = await seedJob(me.id)

    await sendCallback(job.id, 'result', {
      artifactUrl: `${FAKE_CDN}/generations/worker.mp4`,
      videoR2Key: 'generations/worker.mp4',
      mimeType: 'video/mp4',
      duration: 5,
      requestCount: 1,
      seed: 999,
    })

    expect(fakeBucket.uploads).toEqual([])
    expect(await onlyGeneration()).toMatchObject({
      url: `${FAKE_CDN}/generations/worker.mp4`,
      storageKey: 'generations/worker.mp4',
      seed: BigInt(999),
    })
  })

  it('提交时起草的配方补上服务商种子；队列元数据里的 displayLabel 进作品名', async () => {
    const job = await seedJob(me.id, {
      metadata: {
        outputType: 'VIDEO',
        displayLabel: '借伞 30 秒',
        recipe: {
          version: 1,
          kind: 'video',
          modelId: 'kling-video',
          prompt: 'cinematic prompt',
          duration: 5,
          seedSource: 'unknown',
        },
      },
    })

    await sendCallback(job.id, 'result', {
      artifactUrl: `${FAKE_CDN}/generations/v.mp4`,
      videoR2Key: 'generations/v.mp4',
      duration: 5,
      seed: 555,
    })

    const generation = await onlyGeneration()
    expect(generation.recipe).toEqual({
      version: 1,
      kind: 'video',
      modelId: 'kling-video',
      prompt: 'cinematic prompt',
      duration: 5,
      seed: 555,
      seedSource: 'provider',
    })
    expect(
      (generation.snapshot as { displayName?: string }).displayName,
    ).toContain('借伞 30 秒')
  })
})

describe('handleExecutionCallback · 语音', () => {
  it('老的 fal 语音队列：按元数据里的格式转存成音频作品，没有宽高、⛔ 计参考图', async () => {
    const job = await seedJob(me.id, {
      modelId: 'legacy-audio-queue',
      prompt: 'audio prompt',
      metadata: {
        outputType: 'AUDIO',
        audioFormat: 'wav',
        referenceImageUrl: 'https://example.com/reference.png',
      },
    })

    const result = await sendCallback(job.id, 'result', {
      artifactUrl: PROVIDER_AUDIO,
      mimeType: 'audio/wav',
      requestCount: 1,
    })

    expect(result.action).toBe('completed')
    const generation = await onlyGeneration()
    expect(generation.storageKey).toMatch(/\.wav$/)
    expect(fakeBucket.uploads).toEqual([generation.storageKey])
    expect(generation).toMatchObject({
      outputType: 'AUDIO',
      mimeType: 'audio/wav',
      width: 0,
      height: 0,
      referenceImageUrl: null,
    })
    expect(await db.apiUsageLedger.findFirstOrThrow()).toMatchObject({
      inputImageCount: 0,
      outputImageCount: 0,
      width: null,
      height: null,
    })
  })

  it('Fish 由 Worker 自己传进 R2：⛔ 再转存', async () => {
    const job = await seedJob(me.id, {
      modelId: 'fish-audio-s2-pro',
      adapterType: 'fish_audio',
      provider: 'Fish Audio',
      metadata: { outputType: 'AUDIO', audioFormat: 'mp3' },
    })

    await sendCallback(job.id, 'result', {
      artifactUrl: `${FAKE_CDN}/generations/worker.mp3`,
      audioR2Key: 'generations/worker.mp3',
      providerMetadata: { endpointPath: '/v1/tts' },
      mimeType: 'audio/mpeg',
      duration: 3,
      requestCount: 1,
    })

    expect(fakeBucket.uploads).toEqual([])
    expect(await onlyGeneration()).toMatchObject({
      outputType: 'AUDIO',
      url: `${FAKE_CDN}/generations/worker.mp3`,
      storageKey: 'generations/worker.mp3',
      mimeType: 'audio/mpeg',
      duration: 3,
    })
  })
})
