/**
 * L2a 真库 + 真提交链路：视频提交（校验 → 选路 → 参考图转存 → 建任务 → 派给执行 Worker）。
 * 只假边界：执行 Worker（fetch）、R2 的真 I/O。核任务行、派给 Worker 的东西与返回值。
 * 接口层的登录 / 400 / 别人的 key 与状态轮询在 `src/app/api/generate-video/*.int.test.ts`。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/services/storage/r2', async (importOriginal) =>
  (await import('@/test/int/fake-r2')).fakeR2Module(await importOriginal()),
)

import sharp from 'sharp'

import { EXECUTION_WORKFLOW_IDS } from '@/constants/execution'
import { AI_MODELS } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { WORKFLOW_IDS } from '@/constants/workflows'
import { db } from '@/lib/db'
import { submitVideoGeneration } from '@/services/generate-video.service'
import { createTestUser, resetDatabase, seedAssistantKey } from '@/test/int/db'
import {
  installFakeExecutionWorker,
  type FakeExecutionWorker,
} from '@/test/int/execution-worker'
import { FAKE_CDN, fakeBucket } from '@/test/int/fake-r2'
import type { GenerateVideoRequest } from '@/types'

const REF_DATA_URL = 'data:image/png;base64,cmVm'

let me: Awaited<ReturnType<typeof createTestUser>>
let worker: FakeExecutionWorker
let falKeyId: string

function request(
  overrides: Partial<GenerateVideoRequest> = {},
): GenerateVideoRequest {
  return {
    prompt: 'cinematic camera move over a neon city',
    modelId: AI_MODELS.KLING_V3_PRO,
    aspectRatio: '16:9',
    duration: 5,
    apiKeyId: falKeyId,
    workflowId: WORKFLOW_IDS.CINEMATIC_SHORT_VIDEO,
    ...overrides,
  }
}

async function onlyJob() {
  const jobs = await db.generationJob.findMany({ where: { userId: me.id } })
  expect(jobs).toHaveLength(1)
  return jobs[0]!
}
const metaOf = (job: { externalRequestId: string | null }) =>
  JSON.parse(job.externalRequestId ?? '{}') as Record<string, unknown>
type Dispatched = Record<string, unknown> & {
  providerInput: Record<string, unknown>
}
const dispatched = (): Dispatched => {
  expect(worker.requests).toHaveLength(1)
  return worker.requests[0]!.json as Dispatched
}

beforeEach(async () => {
  await resetDatabase()
  fakeBucket.reset()
  me = await createTestUser()
  falKeyId = (await seedAssistantKey(me.id, AI_ADAPTER_TYPES.FAL)).id
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000')
  worker = installFakeExecutionWorker({ instanceId: 'wf-job-1' })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('submitVideoGeneration · 派发', () => {
  it('派给 Worker 的 fal 队列：签名、回调地址、key id（⛔ 明文），参考图先转存', async () => {
    const result = await submitVideoGeneration(
      me.clerkId,
      request({ referenceImage: REF_DATA_URL }),
    )

    const job = await onlyJob()
    expect(result).toEqual({ jobId: job.id, requestId: 'wf-job-1' })
    const sent = worker.requests[0]!
    expect(sent.path).toBe('/workflows/fal-queue')
    expect(sent.headers.get('x-execution-signature')).toBeTruthy()
    expect(dispatched()).toMatchObject({
      runId: job.id,
      workflowId: EXECUTION_WORKFLOW_IDS.FAL_QUEUE,
      outputType: 'VIDEO',
      apiKeyId: falKeyId,
      callbackUrl: 'http://localhost:3000/api/internal/execution/callback',
      resolveKeyUrl: 'http://localhost:3000/api/internal/execution/resolve-key',
    })
    expect(sent.body).not.toContain('sk-test-not-a-real-key')
    const input = dispatched().providerInput
    expect(input.outputStorageKey).toEqual(
      expect.stringMatching(new RegExp(`^generations/.*${me.id}`)),
    )
    expect(String(input.referenceImage).startsWith(`${FAKE_CDN}/`)).toBe(true)
    expect(fakeBucket.uploads).toHaveLength(1)
    expect(metaOf(job)).toMatchObject({
      workerManaged: true,
      outputType: 'VIDEO',
      workflowInstanceId: 'wf-job-1',
      referenceImageUrl: input.referenceImage,
    })
  })

  it('普通 fal 视频（角色转视频）也走 Worker', async () => {
    await submitVideoGeneration(
      me.clerkId,
      request({ workflowId: WORKFLOW_IDS.CHARACTER_TO_VIDEO }),
    )

    expect(dispatched().providerId).toBe(AI_ADAPTER_TYPES.FAL)
  })

  it('Gemini Omni：用它当前的执行型号 id，⛔ 明文 key', async () => {
    const gemini = await seedAssistantKey(me.id, AI_ADAPTER_TYPES.GEMINI)

    await submitVideoGeneration(
      me.clerkId,
      request({
        modelId: AI_MODELS.GEMINI_OMNI_FLASH,
        apiKeyId: gemini.id,
        duration: 8,
      }),
    )

    expect(dispatched()).toMatchObject({
      providerId: 'gemini',
      apiKeyId: gemini.id,
      providerInput: { externalModelId: 'gemini-omni-1.1-flash' },
    })
    expect(worker.requests[0]!.body).not.toContain('sk-test-not-a-real-key')
  })

  it('只在库里配的视频型号：按库里的端点与超时派发', async () => {
    await db.modelConfig.create({
      data: {
        modelId: 'db-only-video',
        externalModelId: 'fal-ai/db-only-video/v2',
        adapterType: AI_ADAPTER_TYPES.FAL,
        outputType: 'VIDEO',
        cost: 6,
        timeoutMs: 420_000,
        providerConfig: { label: 'fal.ai', baseUrl: 'https://fal.run' },
      },
    })

    await submitVideoGeneration(
      me.clerkId,
      request({ modelId: 'db-only-video' as GenerateVideoRequest['modelId'] }),
    )

    expect(dispatched()).toMatchObject({
      timeoutMs: 420_000,
      providerInput: { externalModelId: 'fal-ai/db-only-video/v2' },
    })
  })

  it('参考视频 / 音频、是否出声、种子原样带给 Worker；没给就不带', async () => {
    await submitVideoGeneration(
      me.clerkId,
      request({
        modelId: AI_MODELS.SEEDANCE_20_FAST_REFERENCE,
        workflowId: WORKFLOW_IDS.CHARACTER_TO_VIDEO,
        referenceImage: REF_DATA_URL,
        videoUrls: [
          'https://cdn.example.com/clip-a.mp4',
          'https://cdn.example.com/clip-b.mp4',
        ],
        audioUrls: ['https://cdn.example.com/voice.mp3'],
        generateAudio: false,
        seed: 42,
      }),
    )
    expect(dispatched().providerInput).toMatchObject({
      videoUrls: [
        'https://cdn.example.com/clip-a.mp4',
        'https://cdn.example.com/clip-b.mp4',
      ],
      audioUrls: ['https://cdn.example.com/voice.mp3'],
      generateAudio: false,
      seed: 42,
    })

    worker.requests.length = 0
    await submitVideoGeneration(
      me.clerkId,
      request({
        modelId: AI_MODELS.SEEDANCE_20_FAST_REFERENCE,
        workflowId: WORKFLOW_IDS.CHARACTER_TO_VIDEO,
        referenceImage: REF_DATA_URL,
      }),
    )
    expect(dispatched().providerInput.videoUrls).toBeUndefined()
    expect(dispatched().providerInput.audioUrls).toBeUndefined()
  })

  it('助手起的名搭队列元数据走（切片 Y）；没人给名字就不带这一格', async () => {
    await submitVideoGeneration(
      me.clerkId,
      request({ displayLabel: '借伞 30 秒' }),
    )
    await submitVideoGeneration(me.clerkId, request())

    const jobs = await db.generationJob.findMany({
      where: { userId: me.id },
      orderBy: { createdAt: 'asc' },
    })
    expect(metaOf(jobs[0]!).displayLabel).toBe('借伞 30 秒')
    expect(metaOf(jobs[1]!)).not.toHaveProperty('displayLabel')
  })
})

describe('submitVideoGeneration · SVG 参考图', () => {
  // GPT Image 的 SVG 输出不能当首帧 / 参考图：400，⛔ 建任务、⛔ 转存、⛔ 派发。
  it('参考图里有 SVG：拒', async () => {
    await expect(
      submitVideoGeneration(
        me.clerkId,
        request({
          referenceImages: [
            'https://cdn.example.com/start.png',
            'https://cdn.example.com/u/1/gen.svg',
          ],
        }),
      ),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      status: 400,
      message: "SVG images can't be used as input. Convert it to PNG first.",
    })
    expect(await db.generationJob.count()).toBe(0)
    expect(fakeBucket.uploads).toHaveLength(0)
    expect(worker.requests).toHaveLength(0)
  })
})

describe('submitVideoGeneration · GIF 参考图', () => {
  // GIF 动图只看一帧：首帧 / 参考图是 GIF 就 400「先取首帧」，⛔ 建任务、⛔ 转存、⛔ 派发。
  it('首帧是 GIF：拒，文案说先取首帧', async () => {
    await expect(
      submitVideoGeneration(
        me.clerkId,
        request({ referenceImage: 'https://cdn.example.com/u/1/anim.gif' }),
      ),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      status: 400,
      message:
        "GIF images can't be used as input. Extract its first frame as a PNG to continue.",
    })
    expect(await db.generationJob.count()).toBe(0)
    expect(fakeBucket.uploads).toHaveLength(0)
    expect(worker.requests).toHaveLength(0)
  })

  it('参考图里有 GIF：拒', async () => {
    await expect(
      submitVideoGeneration(
        me.clerkId,
        request({
          referenceImages: [
            'https://cdn.example.com/start.png',
            'https://cdn.example.com/u/1/anim.gif',
          ],
        }),
      ),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      status: 400,
      message:
        "GIF images can't be used as input. Extract its first frame as a PNG to continue.",
    })
    expect(await db.generationJob.count()).toBe(0)
    expect(worker.requests).toHaveLength(0)
  })
})

describe('submitVideoGeneration · 提示词长度与输出尺寸', () => {
  // owner 2026-09-27：长度只认模型自己声明的上限（厂商硬上限）；没声明就不拦。
  it('超过型号声明的上限 400、⛔ 建任务；没声明上限的型号不拦', async () => {
    await expect(
      submitVideoGeneration(
        me.clerkId,
        request({
          modelId: AI_MODELS.KLING_O3_STANDARD_V2V_EDIT,
          prompt: 'a'.repeat(2501),
          videoUrls: ['https://cdn.example.com/clip.mp4'],
        }),
      ),
    ).rejects.toThrow(/exceeds maximum length of 2500/)
    expect(await db.generationJob.count()).toBe(0)

    await submitVideoGeneration(
      me.clerkId,
      request({ prompt: 'a'.repeat(6000) }),
    )
    expect(dispatched().providerInput.prompt).toHaveLength(6000)
  })

  it.each([false, true])(
    'H3 Max Turbo：按首帧（EXIF 竖拍 %s）定尺寸，长提示词用它自己的上限',
    async (exifPortrait) => {
      const start = 'https://cdn.example.com/start.png'
      const end = 'https://cdn.example.com/end.png'
      const firstFrame = await sharp({
        create: {
          width: exifPortrait ? 16 : 9,
          height: exifPortrait ? 9 : 16,
          channels: 3,
          background: '#000000',
        },
      })
        .jpeg()
        .withMetadata({ orientation: exifPortrait ? 6 : 1 })
        .toBuffer()
      const lastFrame = await sharp({
        create: { width: 9, height: 16, channels: 3, background: '#ffffff' },
      })
        .jpeg()
        .toBuffer()
      fakeBucket.remote.set(start, {
        buffer: firstFrame,
        mimeType: 'image/jpeg',
      })
      fakeBucket.remote.set(end, { buffer: lastFrame, mimeType: 'image/jpeg' })
      const prompt = 'a'.repeat(50_000)

      await submitVideoGeneration(
        me.clerkId,
        request({
          modelId: AI_MODELS.MINIMAX_H3_MAX_TURBO,
          prompt,
          referenceImages: [start, end],
          seed: 123,
        }),
      )

      const input = dispatched().providerInput
      expect(input).toMatchObject({
        prompt,
        externalModelId: 'minimax/h3-max-turbo/text-to-video',
        i2vModelId: 'minimax/h3-max-turbo/image-to-video',
        seed: 123,
        width: 768,
        height: 1366,
        videoDefaults: { resolution: '768p' },
      })
      const refs = input.referenceImages as string[]
      expect(refs).toHaveLength(2)
      expect(
        fakeBucket.objects.get(refs[0]!.slice(FAKE_CDN.length + 1)),
      ).toEqual(firstFrame)
    },
  )

  it.each([
    [AI_MODELS.KLING_V3_PRO, '4k'],
    [AI_MODELS.KLING_O3_4K_V2V_EDIT, undefined],
    [AI_MODELS.KLING_O3_4K_V2V_EDIT, '720p'],
  ] as const)(
    '%s（分辨率 %s）：按 4K 估输出尺寸',
    async (modelId, resolution) => {
      await submitVideoGeneration(
        me.clerkId,
        request({
          modelId,
          resolution,
          // 只有改视频的型号收参考视频（真校验会拦）。
          ...(modelId === AI_MODELS.KLING_V3_PRO
            ? {}
            : { videoUrls: ['https://cdn.example.com/clip.mp4'] }),
        }),
      )

      expect(dispatched().providerInput).toMatchObject({
        width: 3840,
        height: 2160,
      })
    },
  )
})

describe('submitVideoGeneration · Worker 出岔子', () => {
  it('Worker 收没收到不知道（断网）：任务留着照常交回，等补发', async () => {
    vi.mocked(fetch).mockImplementation(async () => {
      throw new TypeError('fetch failed')
    })

    const result = await submitVideoGeneration(me.clerkId, request())

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
        data.externalRequestId.includes('wf-job-1')
      ) {
        failedOnce = true
        return Promise.reject(new Error('database write failed'))
      }
      return update(args)
    }) as unknown as typeof update)

    await expect(submitVideoGeneration(me.clerkId, request())).resolves.toEqual(
      { jobId: expect.any(String), requestId: 'wf-job-1' },
    )
    expect(failedOnce).toBe(true)
    expect((await onlyJob()).status).toBe('RUNNING')
  })

  it('Worker 明确拒收：任务判失败、错误往上抛', async () => {
    worker.reject(400)

    await expect(submitVideoGeneration(me.clerkId, request())).rejects.toThrow()
    expect((await onlyJob()).status).toBe('FAILED')
  })

  it('执行 Worker 没配：501，⛔ 建任务、⛔ 发请求', async () => {
    vi.stubEnv('EXECUTION_WORKER_BASE_URL', '')

    await expect(
      submitVideoGeneration(
        me.clerkId,
        request({
          modelId: AI_MODELS.SEEDANCE_20_FAST_REFERENCE,
          referenceImage: REF_DATA_URL,
          videoUrls: ['https://cdn.example.com/clip-a.mp4'],
        }),
      ),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_MODEL', status: 501 })
    expect(await db.generationJob.count()).toBe(0)
    expect(worker.requests).toEqual([])
  })
})
