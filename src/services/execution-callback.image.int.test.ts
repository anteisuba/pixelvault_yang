/**
 * L2a 真库：出图结果回执落库（作品 + 图层 + 任务完成 + 用量一个事务），之后做缩略图 / 预览图。
 * 只假 R2 的真 I/O 与 logger；核 Generation、GenerationLayer、ApiUsageLedger、ExecutionOutbox。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))
vi.mock('@/services/storage/r2', async (importOriginal) =>
  (await import('@/test/int/fake-r2')).fakeR2Module(await importOriginal()),
)

import { EXECUTION_OUTBOX_KINDS } from '@/constants/execution'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { createImagePreviewAssets } from '@/services/storage/r2'
import { createTestUser, resetDatabase } from '@/test/int/db'
import { seedJob, sendCallback } from '@/test/int/execution-callback'
import { FAKE_CDN, fakeBucket } from '@/test/int/fake-r2'

let me: Awaited<ReturnType<typeof createTestUser>>

const PROVIDER_IMAGE = 'https://provider.example.com/image.png'
const WORKER_KEY = 'generations/worker.png'
/** Worker 自己已传进 R2 的那张图。 */
const WORKER_RESULT = {
  artifactUrl: `${FAKE_CDN}/${WORKER_KEY}`,
  imageR2Key: WORKER_KEY,
  mimeType: 'image/png',
  width: 1024,
  height: 1024,
  requestCount: 1,
}

async function onlyGeneration() {
  const rows = await db.generation.findMany({
    where: { userId: me.id },
    include: { layers: true },
  })
  expect(rows).toHaveLength(1)
  return rows[0]!
}
const previewOutboxes = () =>
  db.executionOutbox.findMany({
    where: { kind: EXECUTION_OUTBOX_KINDS.IMAGE_PREVIEW_DERIVATIVES },
  })

beforeEach(async () => {
  await resetDatabase()
  fakeBucket.reset()
  me = await createTestUser()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('handleExecutionCallback · 出图落库', () => {
  it('从服务商转存进 R2，按参考图张数记用量，就地做完缩略图 / 预览图', async () => {
    fakeBucket.remote.set(PROVIDER_IMAGE, {
      buffer: Buffer.alloc(4096, 3),
      mimeType: 'image/png',
    })
    const job = await seedJob(me.id, {
      adapterType: 'openai',
      provider: 'OpenAI',
      modelId: 'gpt-image-2',
      prompt: 'image prompt',
      metadata: {
        outputType: 'IMAGE',
        isFreeGeneration: true,
        creditCost: 1,
        aspectRatio: '1:1',
        referenceImageUrl: 'https://cdn.example.com/ref-1.png',
        referenceImages: [
          'https://cdn.example.com/ref-1.png',
          'https://cdn.example.com/ref-2.png',
        ],
      },
    })

    const result = await sendCallback(job.id, 'result', {
      artifactUrl: PROVIDER_IMAGE,
      mimeType: 'image/png',
      width: 1024,
      height: 1024,
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
      outputType: 'IMAGE',
      url: `${FAKE_CDN}/${generation.storageKey}`,
      width: 1024,
      height: 1024,
      model: 'gpt-image-2',
      provider: 'OpenAI',
      isFreeGeneration: true,
      referenceImageUrl: 'https://cdn.example.com/ref-1.png',
      snapshot: expect.objectContaining({
        referenceImages: [
          'https://cdn.example.com/ref-1.png',
          'https://cdn.example.com/ref-2.png',
        ],
      }),
      // 没传 defer：派生图就地做完。
      thumbnailUrl: `${FAKE_CDN}/${generation.storageKey}.thumb.webp`,
      previewUrl: `${FAKE_CDN}/${generation.storageKey}.preview.webp`,
    })
    expect(await db.apiUsageLedger.findFirstOrThrow()).toMatchObject({
      generationId: generation.id,
      outputImageCount: 1,
      inputImageCount: 2,
      width: 1024,
      height: 1024,
    })
    expect(await previewOutboxes()).toEqual([
      expect.objectContaining({ status: 'COMPLETED' }),
    ])
  })

  it('Worker 已自己传进 R2：⛔ 再转存，存 Worker 的 key', async () => {
    const job = await seedJob(me.id, {
      modelId: 'flux-2-pro',
      metadata: { outputType: 'IMAGE', creditCost: 1, aspectRatio: '1:1' },
    })

    await sendCallback(job.id, 'result', WORKER_RESULT)

    expect(fakeBucket.uploads).toEqual([])
    const generation = await onlyGeneration()
    expect(generation).toMatchObject({
      url: WORKER_RESULT.artifactUrl,
      storageKey: WORKER_KEY,
      layers: [],
    })
    expect(await db.apiUsageLedger.findFirstOrThrow()).toMatchObject({
      outputImageCount: 1,
    })
  })

  it('计费单位按服务端封好的 creditCost 记，⛔ 用 Worker 报的请求次数', async () => {
    const job = await seedJob(me.id, {
      modelId: 'flux-2-pro',
      metadata: { outputType: 'IMAGE', creditCost: 3, aspectRatio: '1:1' },
    })

    await sendCallback(job.id, 'result', WORKER_RESULT)

    expect((await onlyGeneration()).requestCount).toBe(3)
    expect(
      (await db.generationJob.findUniqueOrThrow({ where: { id: job.id } }))
        .requestCount,
    ).toBe(3)
    expect((await db.apiUsageLedger.findFirstOrThrow()).requestCount).toBe(3)
  })

  it('开了先搜再画：作品记 searchGrounded，来源 ⛔ 进 Generation', async () => {
    const job = await seedJob(me.id, {
      adapterType: 'gemini',
      provider: 'Gemini',
      modelId: 'gemini-nano-banana-2.1',
      prompt: 'Taipei 101',
      metadata: {
        outputType: 'IMAGE',
        creditCost: 1,
        aspectRatio: '3:4',
        advancedParams: { searchGrounding: true },
        searchGrounding: {
          status: 'grounded',
          sources: [
            { kind: 'web', url: 'https://example.com/a', title: 'example.com' },
          ],
        },
      },
    })

    await sendCallback(job.id, 'result', WORKER_RESULT)

    const generation = await onlyGeneration()
    expect(generation.searchGrounded).toBe(true)
    expect(
      JSON.stringify({ ...generation, seed: null }, (_, v: unknown) =>
        typeof v === 'bigint' ? String(v) : v,
      ),
    ).not.toContain('example.com/a')
  })

  it('服务商没回种子：记派发前替用户定的那颗', async () => {
    const job = await seedJob(me.id, {
      modelId: 'flux-2-pro',
      prompt: 'a cat',
      metadata: {
        outputType: 'IMAGE',
        creditCost: 1,
        aspectRatio: '1:1',
        assignedSeed: 777,
      },
    })

    await sendCallback(job.id, 'result', WORKER_RESULT)

    const generation = await onlyGeneration()
    expect(generation.seed).toBe(BigInt(777))
    expect(generation.recipe).toMatchObject({
      seed: 777,
      seedSource: 'provider',
    })
  })

  it('精修：作品留原图的提示词与回来的尺寸，修改指令单独存，配方 ⛔ 带比例', async () => {
    const job = await seedJob(me.id, {
      adapterType: 'ideogram',
      provider: 'Ideogram',
      modelId: 'ideogram-4.5',
      prompt: 'Make the mug blue',
      metadata: {
        outputType: 'IMAGE',
        creditCost: 1,
        aspectRatio: '1:1',
        imageOperation: 'precise-edit',
        imageEditSourcePrompt: 'A red mug by the window',
        sourceGenerationId: 'original',
        referenceImages: ['https://cdn.example.com/source.png'],
      },
    })

    await sendCallback(job.id, 'result', {
      ...WORKER_RESULT,
      width: 1672,
      height: 941,
      providerMetadata: { seed: 123 },
    })

    const generation = await onlyGeneration()
    expect(generation).toMatchObject({
      prompt: 'A red mug by the window',
      width: 1672,
      height: 941,
      seed: BigInt(123),
      snapshot: expect.objectContaining({
        compiledPrompt: 'A red mug by the window',
        sourceGenerationId: 'original',
        imageEditPrompt: 'Make the mug blue',
        imageOperation: 'precise-edit',
        seed: 123,
      }),
      recipe: expect.objectContaining({
        version: 1,
        kind: 'image',
        modelId: 'ideogram-4.5',
        prompt: 'Make the mug blue',
        imageOperation: 'precise-edit',
        referenceImages: ['https://cdn.example.com/source.png'],
        seed: 123,
        seedSource: 'provider',
      }),
    })
    expect(generation.snapshot).not.toHaveProperty('aspectRatio')
    expect(generation.recipe).not.toHaveProperty('aspectRatio')
  })

  it('队列元数据里的 displayLabel 进作品名', async () => {
    const job = await seedJob(me.id, {
      modelId: 'flux-2-pro',
      metadata: {
        outputType: 'IMAGE',
        creditCost: 1,
        aspectRatio: '1:1',
        displayLabel: '主视觉',
      },
    })

    await sendCallback(job.id, 'result', WORKER_RESULT)

    expect(
      ((await onlyGeneration()).snapshot as { displayName?: string })
        .displayName,
    ).toContain('主视觉')
  })

  /**
   * 图层拆分（进度表 62）：Worker 已把底图和每个图层传进 R2，图层作为子行同一个事务落库，
   * 用量按底图 + 图层数记 —— provider 的 usage.generated_images 也是这么算的。
   * https://www.volcengine.com/docs/82379/1541523
   */
  it('Worker 报上来的图层落成子行（存自己的 R2 地址），产出图数算上图层', async () => {
    const job = await seedJob(me.id, {
      adapterType: 'volcengine',
      provider: 'VolcEngine',
      modelId: 'seedream-5.0-pro-volcengine',
      prompt: 'split this poster',
      metadata: { outputType: 'IMAGE', creditCost: 2, aspectRatio: '1:1' },
    })
    const boundingBox = {
      absolute: [383, 120, 1655, 384],
      normalized: [187, 59, 808, 188],
    }

    await sendCallback(job.id, 'result', {
      ...WORKER_RESULT,
      width: 2048,
      height: 2048,
      layers: [
        {
          zIndex: 1,
          artifactUrl: `${FAKE_CDN}/generations/base-layer-1.png`,
          imageR2Key: 'generations/base-layer-1.png',
          mimeType: 'image/png',
          width: 1273,
          height: 265,
          name: 'Seedream标题文字',
          description: '黄色大号衬线字体的Seedream标题文字',
          boundingBox,
        },
      ],
    })

    expect((await onlyGeneration()).layers).toEqual([
      expect.objectContaining({
        zIndex: 1,
        url: `${FAKE_CDN}/generations/base-layer-1.png`,
        storageKey: 'generations/base-layer-1.png',
        width: 1273,
        height: 265,
        name: 'Seedream标题文字',
        description: '黄色大号衬线字体的Seedream标题文字',
        boundingBox,
      }),
    ])
    expect(await db.apiUsageLedger.findFirstOrThrow()).toMatchObject({
      outputImageCount: 2,
    })
  })

  it.each([
    {
      runnerJobId: 'runner-job-1',
      runnerExecution: {
        version: 1,
        evidence: 'loader-output',
        imageSha256: 'c'.repeat(64),
        models: [
          {
            kind: 'lora',
            filename: 'loaded-character.safetensors',
            sha256: 'b'.repeat(64),
            sizeBytes: 50,
            strengthModel: 0.8,
            strengthClip: 0.7,
          },
        ],
      },
    },
    { runnerJobId: 'runner-without-evidence', futureField: 'unknown-metadata' },
    undefined,
  ])(
    'Runner 回执的 providerMetadata 原样进快照，⛔ 拿请求里的 checkpoint 冒充加载证据：%j',
    async (providerMetadata) => {
      const job = await seedJob(me.id, {
        adapterType: 'runner',
        provider: 'runner',
        modelId: 'illustrious-runner',
        metadata: {
          outputType: 'IMAGE',
          creditCost: 1,
          aspectRatio: '1:1',
          advancedParams: {
            runnerCheckpoint: 'requested-but-not-load-evidence.safetensors',
          },
        },
      })

      await sendCallback(job.id, 'result', {
        ...WORKER_RESULT,
        ...(providerMetadata ? { providerMetadata } : {}),
      })

      const snapshot = (await onlyGeneration()).snapshot as {
        executionCallback: { providerMetadata?: unknown }
      }
      expect(snapshot.executionCallback.providerMetadata).toEqual(
        providerMetadata,
      )
    },
  )
})

describe('handleExecutionCallback · 缩略图 / 预览图（落库后立刻做）', () => {
  const seedImageJob = () =>
    seedJob(me.id, {
      adapterType: 'openai',
      provider: 'OpenAI',
      modelId: 'gpt-image-2.5-flare',
      metadata: { outputType: 'IMAGE', creditCost: 1, aspectRatio: '4:3' },
    })

  it('传了 defer：入队后挂到响应之后做，⛔ 挡回执', async () => {
    const job = await seedImageJob()
    const deferred: Array<() => Promise<void>> = []

    const result = await sendCallback(job.id, 'result', WORKER_RESULT, {
      defer: (task) => {
        deferred.push(task)
      },
    })

    expect(result.action).toBe('completed')
    expect(deferred).toHaveLength(1)
    expect(await previewOutboxes()).toEqual([
      expect.objectContaining({
        generationJobId: job.id,
        status: 'PENDING',
        payload: expect.objectContaining({ sourceStorageKey: WORKER_KEY }),
      }),
    ])
    expect((await onlyGeneration()).thumbnailUrl).toBeNull()

    await deferred[0]!()

    expect(await previewOutboxes()).toEqual([
      expect.objectContaining({ status: 'COMPLETED' }),
    ])
    expect((await onlyGeneration()).thumbnailUrl).toBe(
      `${FAKE_CDN}/${WORKER_KEY}.thumb.webp`,
    )
  })

  it('派生图做失败：作品照样算完成，任务留在 outbox 等定时任务', async () => {
    vi.mocked(createImagePreviewAssets).mockRejectedValueOnce(
      new Error('worker unavailable'),
    )
    const job = await seedImageJob()

    const result = await sendCallback(job.id, 'result', WORKER_RESULT)

    expect(result).toEqual({
      runId: job.id,
      jobStatus: 'COMPLETED',
      action: 'completed',
    })
    expect(
      (await db.generationJob.findUniqueOrThrow({ where: { id: job.id } }))
        .status,
    ).toBe('COMPLETED')
    expect(await previewOutboxes()).toEqual([
      expect.objectContaining({
        status: 'PENDING',
        lastError: 'worker unavailable',
      }),
    ])
  })

  it('入队失败：⛔ 处理，作品照样算完成', async () => {
    vi.spyOn(db.executionOutbox, 'create').mockRejectedValueOnce(
      new Error('outbox insert failed'),
    )
    const job = await seedImageJob()
    const deferred: Array<() => Promise<void>> = []

    const result = await sendCallback(job.id, 'result', WORKER_RESULT, {
      defer: (task) => {
        deferred.push(task)
      },
    })

    expect(result.action).toBe('completed')
    expect(deferred).toHaveLength(0)
    expect(await previewOutboxes()).toEqual([])
    expect(logger.warn).toHaveBeenCalledWith(
      'Image preview derivative enqueue failed (callback)',
      expect.objectContaining({ runId: job.id }),
    )
  })
})
