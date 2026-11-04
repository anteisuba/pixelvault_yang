/**
 * L2a 真库 + 真提交链路：出图提交（选路 → 建任务 → 派发 outbox → 发给执行 Worker）。
 * 只假边界：执行 Worker / Civitai（fetch）、R2 的真 I/O。核任务行、发给 Worker 的东西与返回值。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/services/storage/r2', async (importOriginal) =>
  (await import('@/test/int/fake-r2')).fakeR2Module(await importOriginal()),
)
// Comfy Runner 档在线上开着；型号目录在模块加载时读这个开关。
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_FF_COMFY_RUNNER = 'true'
})

import { AI_MODELS } from '@/constants/models/enum'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { EXECUTION_WORKER } from '@/constants/execution'
import { db } from '@/lib/db'
import { encodePng } from '@/lib/image-pixels'
import { setCivitaiToken } from '@/features/lora/server'
import { submitImageGeneration } from '@/services/image/submit-image.service'
import { createTestUser, resetDatabase, seedAssistantKey } from '@/test/int/db'
import {
  installFakeExecutionWorker,
  type FakeExecutionWorker,
} from '@/test/int/execution-worker'
import { FAKE_CDN, fakeBucket } from '@/test/int/fake-r2'
import type { GenerateRequest } from '@/types'

const CIVITAI = 'https://civitai.com/api/v1/model-versions/'

let me: Awaited<ReturnType<typeof createTestUser>>
let worker: FakeExecutionWorker
/** Civitai 上每个版本的下载开关（`usageControl`）；没登记的回 404 = 判不了。 */
let civitai: Map<number, { usageControl: string; name: string }>
let civitaiDown = false

const INPUT: GenerateRequest = {
  prompt: 'A red circle',
  modelId: AI_MODELS.OPENAI_GPT_IMAGE_2,
  aspectRatio: '1:1',
}

const LORA = (versionId: number) => ({
  url: `https://civitai.com/api/download/models/${versionId}`,
  scale: 0.9,
})

async function onlyJob() {
  const jobs = await db.generationJob.findMany({ where: { userId: me.id } })
  expect(jobs).toHaveLength(1)
  return jobs[0]!
}
const metadataOf = (job: { externalRequestId: string | null }) =>
  JSON.parse(job.externalRequestId ?? '{}') as Record<string, unknown>
const dispatched = () => {
  expect(worker.requests).toHaveLength(1)
  return worker.requests[0]!.json as {
    runId: string
    providerId: string
    apiKeyId?: string
    useSystemKey?: boolean
    maxAttempts: number
    providerInput: Record<string, unknown> & {
      advancedParams?: Record<string, unknown>
    }
  }
}

beforeEach(async () => {
  await resetDatabase()
  fakeBucket.reset()
  me = await createTestUser()
  civitai = new Map()
  civitaiDown = false
  worker = installFakeExecutionWorker({
    other: (url) => {
      if (!url.startsWith(CIVITAI)) return new Response('nope', { status: 404 })
      if (civitaiDown) throw new TypeError('fetch failed')
      const version = civitai.get(Number(url.slice(CIVITAI.length)))
      return version
        ? Response.json({ id: 1, ...version })
        : new Response('not found', { status: 404 })
    },
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('submitImageGeneration · 派发', () => {
  it('建任务（RUNNING）→ 派发给 Worker（带选中的 key id）→ 回任务号与实例号', async () => {
    const key = await seedAssistantKey(me.id, AI_ADAPTER_TYPES.OPENAI)

    const result = await submitImageGeneration(me.clerkId, {
      ...INPUT,
      apiKeyId: key.id,
    })

    const job = await onlyJob()
    expect(result).toEqual({ jobId: job.id, requestId: 'wf_1' })
    expect(job).toMatchObject({
      status: 'RUNNING',
      adapterType: AI_ADAPTER_TYPES.OPENAI,
      modelId: AI_MODELS.OPENAI_GPT_IMAGE_2,
    })
    expect(job.externalRequestId).toContain('wf_1')
    expect(worker.requests[0]!.path).toBe(EXECUTION_WORKER.IMAGE_QUEUE_PATH)
    expect(dispatched()).toMatchObject({
      runId: job.id,
      providerId: AI_ADAPTER_TYPES.OPENAI,
      apiKeyId: key.id,
    })
  })

  it('FAL 文生图：Worker 拿到最终的 R2 key，长轮询', async () => {
    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.FAL)

    await submitImageGeneration(me.clerkId, {
      ...INPUT,
      modelId: AI_MODELS.SEEDREAM_50_PRO,
    })

    const sent = dispatched()
    expect(sent.providerId).toBe(AI_ADAPTER_TYPES.FAL)
    expect(sent.maxAttempts).toBeGreaterThan(1)
    expect(sent.providerInput.outputStorageKey).toEqual(
      expect.stringMatching(new RegExp(`^generations/.*${me.id}`)),
    )
  })

  it('同步出图的 adapter（Gemini）也走 Worker，只跑一次', async () => {
    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.GEMINI)

    await submitImageGeneration(me.clerkId, {
      ...INPUT,
      modelId: AI_MODELS.GEMINI_NANO_BANANA_21,
    })

    expect(dispatched()).toMatchObject({
      providerId: AI_ADAPTER_TYPES.GEMINI,
      maxAttempts: 1,
      providerInput: expect.objectContaining({
        outputStorageKey: expect.any(String),
      }),
    })
  })

  it('没配 key 的付费路由：MISSING_API_KEY，⛔ 建任务、⛔ 派发', async () => {
    await expect(
      submitImageGeneration(me.clerkId, {
        ...INPUT,
        modelId: AI_MODELS.SEEDREAM_50_PRO,
      }),
    ).rejects.toMatchObject({ code: 'MISSING_API_KEY', status: 400 })
    expect(await db.generationJob.count()).toBe(0)
    expect(worker.requests).toHaveLength(0)
  })

  it('执行 Worker 没配：503，⛔ 建任务', async () => {
    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.OPENAI)
    vi.stubEnv('EXECUTION_WORKER_BASE_URL', '')

    await expect(
      submitImageGeneration(me.clerkId, INPUT),
    ).rejects.toMatchObject({ code: 'PROVIDER_ERROR', status: 503 })
    expect(await db.generationJob.count()).toBe(0)
  })

  it('Worker 明确拒收：任务落 FAILED、错误往上抛', async () => {
    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.OPENAI)
    worker.reject(400)

    await expect(submitImageGeneration(me.clerkId, INPUT)).rejects.toThrow()
    const job = await onlyJob()
    expect(job.status).toBe('FAILED')
    expect(job.errorMessage).toBeTruthy()
  })

  it('Worker 收没收到不知道（5xx）：任务留着、照常交回任务号，等补发', async () => {
    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.OPENAI)
    worker.reject(502)

    const result = await submitImageGeneration(me.clerkId, INPUT)

    const job = await onlyJob()
    expect(result).toEqual({ jobId: job.id, requestId: job.id })
    expect(job.status).toBe('RUNNING')
  })

  it('派发已被收下、回写实例号失败：⛔ 把收下的任务判失败', async () => {
    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.OPENAI)
    vi.spyOn(db.generationJob, 'update').mockRejectedValueOnce(
      new Error('database write failed'),
    )

    const result = await submitImageGeneration(me.clerkId, INPUT)

    const job = await onlyJob()
    expect(result).toEqual({ jobId: job.id, requestId: 'wf_1' })
    expect(job.status).toBe('RUNNING')
  })

  it('多视角批次：批次号、角度、来源图记在任务上，供状态聚合', async () => {
    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.OPENAI)

    await submitImageGeneration(
      me.clerkId,
      INPUT,
      {},
      {
        multiViewBatchId: 'batch-1',
        multiViewAngle: 'back',
        sourceGenerationId: 'source-gen-1',
      },
    )

    expect(metadataOf(await onlyJob())).toMatchObject({
      outputType: 'IMAGE',
      multiViewBatchId: 'batch-1',
      multiViewAngle: 'back',
      sourceGenerationId: 'source-gen-1',
    })
  })
})

describe('submitImageGeneration · 参考图与遮罩', () => {
  it('客户端的 data URL 参考图先进 R2，任务与 Worker 都只拿稳定地址', async () => {
    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.OPENAI)

    await submitImageGeneration(me.clerkId, {
      ...INPUT,
      referenceImages: ['data:image/png;base64,cmVm'],
    })

    expect(fakeBucket.uploads).toHaveLength(1)
    const stable = `${FAKE_CDN}/${fakeBucket.uploads[0]}`
    expect((await onlyJob()).externalRequestId).toContain(stable)
    expect(dispatched().providerInput).toMatchObject({
      referenceImage: stable,
      referenceImages: [stable],
    })
  })

  it('遮罩：Worker 拿到的是 R2 地址，⛔ 客户端那串 data URL', async () => {
    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.NOVELAI)

    await submitImageGeneration(me.clerkId, {
      ...INPUT,
      modelId: AI_MODELS.NOVELAI_V5_CURATED,
      // 局部重绘只认一张要重画的底图。
      referenceImages: [`${FAKE_CDN}/base.png`],
      advancedParams: { inpaintMask: 'data:image/png;base64,bWFzaw==' },
    })

    const mask = dispatched().providerInput.advancedParams?.inpaintMask
    expect(mask).toEqual(expect.stringMatching(new RegExp(`^${FAKE_CDN}/`)))
    expect(JSON.stringify(dispatched())).not.toContain('data:image/png')
  })

  it('精修：选中的 key、来源记在任务上；遮罩只在发给服务商的那份里黑白反过来', async () => {
    const key = await seedAssistantKey(me.id, AI_ADAPTER_TYPES.IDEOGRAM)
    const source = `${FAKE_CDN}/source.png`
    const uiMask = `${FAKE_CDN}/ui-mask.png`
    // 4×1：左半要改（白）、右半保留（黑）。
    const pixels = (rgb: number[][]) => ({
      width: rgb.length,
      height: 1,
      data: new Uint8Array(rgb.flatMap((c) => [...c, 255])),
    })
    fakeBucket.remote.set(source, {
      buffer: await encodePng(pixels(Array(4).fill([10, 20, 30]))),
      mimeType: 'image/png',
    })
    fakeBucket.remote.set(uiMask, {
      buffer: await encodePng(
        pixels([
          [255, 255, 255],
          [255, 255, 255],
          [0, 0, 0],
          [0, 0, 0],
        ]),
      ),
      mimeType: 'image/png',
    })

    await submitImageGeneration(
      me.clerkId,
      {
        ...INPUT,
        modelId: AI_MODELS.IDEOGRAM_45,
        apiKeyId: key.id,
        referenceImages: [source],
        advancedParams: { quality: 'medium', inpaintMask: uiMask },
      },
      {},
      { imageOperation: 'precise-edit', sourceGenerationId: 'source-gen' },
    )

    const sent = dispatched()
    expect(sent).toMatchObject({
      providerId: AI_ADAPTER_TYPES.IDEOGRAM,
      apiKeyId: key.id,
      providerInput: { imageOperation: 'precise-edit' },
    })
    expect(sent.maxAttempts).toBeGreaterThan(1)
    const providerMask = sent.providerInput.advancedParams?.inpaintMask
    expect(providerMask).not.toBe(uiMask)
    expect(fakeBucket.uploads).toContain(
      String(providerMask).slice(`${FAKE_CDN}/`.length),
    )
    // 库里记的是界面上那张（重放 / 再编辑用），⛔ 反过来的那张。
    expect(metadataOf(await onlyJob())).toMatchObject({
      imageOperation: 'precise-edit',
      sourceGenerationId: 'source-gen',
      advancedParams: { inpaintMask: uiMask },
    })
  })
})

describe('submitImageGeneration · 种子（派发前先定）', () => {
  const seedOf = () => dispatched().providerInput.advancedParams?.seed

  it('FAL 用户留随机：替她定一颗，记在任务上，⛔ 改她的参数', async () => {
    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.FAL)
    await submitImageGeneration(me.clerkId, {
      ...INPUT,
      modelId: AI_MODELS.RECRAFT_V4_PRO,
      advancedParams: { seed: -1 },
    })
    const seed = seedOf()
    expect(Number.isInteger(seed)).toBe(true)
    expect(seed as number).toBeGreaterThanOrEqual(0)
    const metadata = metadataOf(await onlyJob())
    expect(metadata.assignedSeed).toBe(seed)
    expect(metadata.advancedParams).toEqual({ seed: -1 })
  })

  it('她填了种子：原样发，什么都不替她定', async () => {
    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.FAL)
    await submitImageGeneration(me.clerkId, {
      ...INPUT,
      modelId: AI_MODELS.RECRAFT_V4_PRO,
      advancedParams: { seed: 42 },
    })
    expect(seedOf()).toBe(42)
    expect(metadataOf(await onlyJob()).assignedSeed).toBeUndefined()
  })

  it('不收种子的服务商：不定', async () => {
    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.OPENAI)
    await submitImageGeneration(me.clerkId, INPUT)
    expect(seedOf()).toBeUndefined()
    expect(metadataOf(await onlyJob()).assignedSeed).toBeUndefined()
  })
})

describe('submitImageGeneration · 先搜再画与提示词', () => {
  it('支持的型号原样带上开关', async () => {
    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.GEMINI)
    await submitImageGeneration(me.clerkId, {
      ...INPUT,
      modelId: AI_MODELS.GEMINI_NANO_BANANA_21,
      advancedParams: { searchGrounding: true },
    })
    expect(dispatched().providerInput.advancedParams).toMatchObject({
      searchGrounding: true,
    })
  })

  it('别的型号去掉开关，不进快照', async () => {
    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.OPENAI)
    await submitImageGeneration(me.clerkId, {
      ...INPUT,
      advancedParams: { searchGrounding: true, quality: 'high' },
    })
    expect(
      dispatched().providerInput.advancedParams?.searchGrounding,
    ).toBeUndefined()
    expect(metadataOf(await onlyJob()).advancedParams).toEqual({
      quality: 'high',
    })
  })

  it('同一句提示词哪里都能用：权重翻成这家的写法，<lora:…> 拿掉', async () => {
    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.GEMINI)
    await submitImageGeneration(me.clerkId, {
      ...INPUT,
      modelId: AI_MODELS.GEMINI_NANO_BANANA_21,
      prompt: 'masterpiece, <lora:style:0.7>, (1girl:1.2), {rain}',
      advancedParams: { negativePrompt: '1.2::lowres::' },
    })
    expect((await onlyJob()).prompt).toBe('masterpiece, 1girl, rain')
    expect(dispatched().providerInput.advancedParams?.negativePrompt).toBe(
      'lowres',
    )
  })

  it('正文只剩一枚 <lora:…> 时照原样发，不发空提示词', async () => {
    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.GEMINI)
    await submitImageGeneration(me.clerkId, {
      ...INPUT,
      modelId: AI_MODELS.GEMINI_NANO_BANANA_21,
      prompt: '<lora:style:0.7>',
    })
    expect((await onlyJob()).prompt).toBe('<lora:style:0.7>')
  })
})

describe('submitImageGeneration · LoRA 与 Runner', () => {
  const RUNNER_INPUT = {
    ...INPUT,
    modelId: AI_MODELS.ANIMA_PENCIL_XL_RUNNER,
  }

  beforeEach(async () => {
    vi.stubEnv('CIVITAI_TOKEN_SECRET', 'a'.repeat(64))
    await setCivitaiToken(me.clerkId, 'user-civitai-token')
  })

  it('平台代付的 Runner：没有任何服务商 key 也照派（MISSING_API_KEY 回归）', async () => {
    const result = await submitImageGeneration(me.clerkId, RUNNER_INPUT)

    const job = await onlyJob()
    expect(result).toEqual({ jobId: job.id, requestId: 'wf_1' })
    const sent = dispatched()
    expect(sent.providerId).toBe(AI_ADAPTER_TYPES.RUNNER)
    expect(sent.apiKeyId).toBeUndefined()
    expect(sent.useSystemKey).toBeUndefined()
  })

  it('带 LoRA：用她的 Civitai token 拉进 R2，Worker 拿到预签名地址', async () => {
    await submitImageGeneration(me.clerkId, {
      ...RUNNER_INPUT,
      advancedParams: { loras: [LORA(111)] },
    })

    expect(fakeBucket.uploads).toEqual(['runner-loras/civitai-111.safetensors'])
    expect(dispatched().providerInput.advancedParams?.runnerLoras).toEqual([
      {
        filename: 'civitai-111.safetensors',
        downloadUrl: `${FAKE_CDN}/runner-loras/civitai-111.safetensors?signed`,
        scale: 0.9,
      },
    ])
  })

  it('LoRA 拉不下来（大得离谱）：任务落 FAILED，⛔ 留一条永远 RUNNING 的', async () => {
    fakeBucket.verifiedUpload = async () => {
      throw new Error(
        'Remote file exceeds maximum size of 536870912 bytes (declared 4182218328).',
      )
    }

    await expect(
      submitImageGeneration(me.clerkId, {
        ...RUNNER_INPUT,
        advancedParams: { loras: [LORA(222)] },
      }),
    ).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
      message: expect.stringContaining('512 MB'),
    })
    const job = await onlyJob()
    expect(job.status).toBe('FAILED')
    expect(job.errorMessage).toContain('512 MB')
    expect(worker.requests).toHaveLength(0)
  })

  it('Civitai token 全被拒：归成 INVALID_API_KEY（401）', async () => {
    fakeBucket.verifiedUpload = async ({ sourceUrl }) => {
      throw new Error(`Failed to fetch file for upload (401): ${sourceUrl}`)
    }

    await expect(
      submitImageGeneration(me.clerkId, {
        ...INPUT,
        modelId: AI_MODELS.ILLUSTRIOUS_RECIPE_CLONE,
        advancedParams: { loras: [LORA(2266398)] },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_API_KEY', status: 401 })
    const job = await onlyJob()
    expect(job.status).toBe('FAILED')
    expect(job.errorMessage).toBe('Civitai API token is invalid or expired.')
    expect(worker.requests).toHaveLength(0)
  })

  it('作者关了下载的 LoRA：点名拦下，⛔ 建任务 / 传参考图 / 派发（托管路由也拦）', async () => {
    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.FAL)
    civitai.set(2266398, { usageControl: 'Generation', name: 'Ananta' })
    const request = {
      ...INPUT,
      modelId: AI_MODELS.SEEDREAM_50_PRO,
      referenceImages: ['data:image/png;base64,cmVm'],
      advancedParams: { loras: [LORA(2266398)] },
    }

    await expect(
      submitImageGeneration(me.clerkId, request),
    ).rejects.toMatchObject({ code: 'LORA_DOWNLOAD_DISABLED', status: 422 })
    await expect(submitImageGeneration(me.clerkId, request)).rejects.toThrow(
      /Ananta/,
    )
    expect(await db.generationJob.count()).toBe(0)
    expect(fakeBucket.uploads).toHaveLength(0)
    expect(worker.requests).toHaveLength(0)
  })

  it('Civitai 连不上：判不了 ≠ 拦下，照常派发', async () => {
    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.FAL)
    civitaiDown = true

    const result = await submitImageGeneration(me.clerkId, {
      ...INPUT,
      modelId: AI_MODELS.SEEDREAM_50_PRO,
      advancedParams: { loras: [LORA(2266398)] },
    })

    expect(result.requestId).toBe('wf_1')
  })
})
