/**
 * L2a 真库：工作台出图入口 `compileAndGenerate` —— 编译提示词（@图N、卡片总线）→
 * 真 `submitImageGeneration`（选路由、取 key、建任务行）→ 派给执行 Worker。
 *
 * 只假边界：Clerk（`ensureUser` 见到资料齐全的行不去问 Clerk）、R2、Worker 那一跳的
 * `fetch`。断言落库的任务行（提示词 + 队列元数据）和真发给 Worker 的请求。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
// R2：自家桶（cdn.test）的图原样用；外链转存进桶 —— 转存后的地址带原文件名，好断言顺序。
vi.mock('@/services/storage/r2', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/storage/r2')>()),
  isOwnedStorageUrl: (url: string) => url.startsWith('https://cdn.test/'),
  uploadFromHttpToR2: vi.fn(async ({ sourceUrl }: { sourceUrl: string }) => ({
    publicUrl: `https://cdn.test/mirror/${sourceUrl.split('/').pop()}`,
  })),
}))

import { AI_MODELS } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { CARD_EXTENSIONS } from '@/constants/cards/character-card'
import { compileAndGenerate } from '@/features/studio/services/studio-generate.service'
import { db } from '@/lib/db'
import { GenerationValidationError } from '@/lib/errors'
import type { ImageQueueMetadata } from '@/services/image/submit-image.service'
import type { StudioGenerateRequest } from '@/types'
import { createTestUser, resetDatabase, seedAssistantKey } from '@/test/int/db'

// 在售、声明了 8000 字上限、收参考图的型号（原测试用的 FLUX 2 Flash 已下架，真路由会拒）。
const QUICK_INPUT: StudioGenerateRequest = {
  modelId: AI_MODELS.GEMINI_NANO_BANANA_21,
  freePrompt: 'A studio portrait',
  aspectRatio: '1:1',
}

let me: Awaited<ReturnType<typeof createTestUser>>
let workerCalls: Array<{ url: string; body: unknown }>

beforeEach(async () => {
  await resetDatabase()
  me = await createTestUser()
  await seedAssistantKey(me.id, AI_ADAPTER_TYPES.FAL)
  await seedAssistantKey(me.id, AI_ADAPTER_TYPES.GEMINI)
  vi.stubEnv('EXECUTION_WORKER_BASE_URL', 'https://worker.test')
  vi.stubEnv('INTERNAL_CALLBACK_SECRET', 'test-secret')
  workerCalls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input)
      if (!url.startsWith('https://worker.test')) {
        throw new Error(`没登记的外部请求：${url}`)
      }
      workerCalls.push({
        url,
        body: init?.body ? JSON.parse(String(init.body)) : null,
      })
      return Response.json({ accepted: true }, { status: 202 })
    }),
  )
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

/** 这一用户唯一那条任务：落库的提示词 + 队列元数据。 */
async function onlyJob() {
  const jobs = await db.generationJob.findMany({ where: { userId: me.id } })
  expect(jobs).toHaveLength(1)
  const job = jobs[0]!
  return {
    job,
    meta: JSON.parse(job.externalRequestId ?? '{}') as ImageQueueMetadata,
  }
}

async function jobCount() {
  return db.generationJob.count({ where: { userId: me.id } })
}

describe('compileAndGenerate prompt limits', () => {
  it('resolves uploaded image mentions in the same order as the request images', async () => {
    await compileAndGenerate(me.clerkId, {
      ...QUICK_INPUT,
      freePrompt: 'Use @Image2 for style and @Image1 for identity',
      referenceImages: [
        'https://example.com/identity.png',
        'https://example.com/style.png',
      ],
    })
    const { job, meta } = await onlyJob()
    expect(job.prompt).toBe(
      'Use reference image 2 for style and reference image 1 for identity',
    )
    expect(meta.referenceImages).toEqual([
      'https://cdn.test/mirror/identity.png',
      'https://cdn.test/mirror/style.png',
    ])
    expect(workerCalls).not.toHaveLength(0)
  })

  it('rejects mentions whose uploaded reference is missing before submitting a job', async () => {
    await expect(
      compileAndGenerate(me.clerkId, {
        ...QUICK_INPUT,
        freePrompt: 'Use @Image2',
        referenceImages: ['https://example.com/one.png'],
      }),
    ).rejects.toBeInstanceOf(GenerationValidationError)
    expect(await jobCount()).toBe(0)
    expect(workerCalls).toHaveLength(0)
  })

  it('rejects quick-mode freePrompt over the resolved model maxPromptChars', async () => {
    const promise = compileAndGenerate(me.clerkId, {
      ...QUICK_INPUT,
      freePrompt: 'a'.repeat(8001),
    })

    await expect(promise).rejects.toMatchObject({
      errorCode: 'VALIDATION_ERROR',
      message: '提示词超过该模型上限 8000 字符',
      fieldErrors: [
        {
          field: 'freePrompt',
          message: '提示词超过该模型上限 8000 字符',
        },
      ],
    })
    await expect(promise).rejects.toBeInstanceOf(GenerationValidationError)
    expect(await jobCount()).toBe(0)
  })

  // ⭐ owner 2026-08-24：模型没声明上限时**不拦**。此前兜底到卡片配方「动作 /
  // 姿势」输入框的 2000（09-27 随「提示词不设我们自己的字数上限」一起删了），而这条
  // 链路剩下的边界只有 `StudioGenerateSchema` 的防滥用护栏
  // `PROMPT_TEXT_GUARD_MAX_CHARS`（50000）。
  it('⭐ 模型没声明 maxPromptChars 时不拦 —— 不给未知模型编一个上限', async () => {
    // 目录里 18 个图片型号没有声明上限（Seedream / NovelAI / Illustrious …），
    // 此前它们全部被那个借来的 2000 拦着。
    await compileAndGenerate(me.clerkId, {
      ...QUICK_INPUT,
      modelId: AI_MODELS.RECRAFT_V4_PRO,
      freePrompt: 'a'.repeat(2932),
    })

    const { job } = await onlyJob()
    expect(job.prompt).toHaveLength(2932)
  })

  it('allows quick-mode freePrompt at the resolved model maxPromptChars', async () => {
    const result = await compileAndGenerate(me.clerkId, {
      ...QUICK_INPUT,
      freePrompt: 'a'.repeat(8000),
    })

    const { job } = await onlyJob()
    expect(result).toMatchObject({ jobId: job.id })
    expect(job.prompt).toBe('a'.repeat(8000))
    expect(job.modelId).toBe(AI_MODELS.GEMINI_NANO_BANANA_21)
  })
})

/**
 * 切片 Y 的**服务端半条** —— 助手给这一枪起的名要一路走到落库那一跳。
 *
 * ⭐ 钉的是「它搭队列元数据走」这件事：图片生成是异步的，请求这一跳只建 job，
 * 而产物名只有在几十秒后的回调里才写得进 snapshot。名字掉在这一跳的表现是
 * 「助手说这枪叫『主视觉』，出来的名字却是提示词头几个字」。
 */
describe('compileAndGenerate 透传 displayLabel（切片 Y）', () => {
  it('quick 模式把 displayLabel 交给队列元数据', async () => {
    await compileAndGenerate(me.clerkId, {
      ...QUICK_INPUT,
      displayLabel: '主视觉',
    })

    const { meta } = await onlyJob()
    expect(meta.displayLabel).toBe('主视觉')
  })

  it('⚠ 没人给名字时不带这一格（⛔ 不写一个空串盖掉摘要）', async () => {
    await compileAndGenerate(me.clerkId, QUICK_INPUT)

    const { meta } = await onlyJob()
    expect(meta).not.toHaveProperty('displayLabel')
  })
})

describe('compileAndGenerate 卡片总线（进度表 35 ⑤）', () => {
  async function seedDenia() {
    const card = await db.characterCard.create({
      data: {
        userId: me.id,
        name: 'Denia',
        handle: 'Denia',
        version: 3,
        extensions: { [CARD_EXTENSIONS.KEYS.negative]: 'extra fingers' },
      },
    })
    const look = await db.characterLook.create({
      data: {
        characterCardId: card.id,
        isDefault: true,
        description: 'red eyes, dark blue hair',
        referenceSlots: [
          {
            id: 'slot-1',
            role: 'identity',
            url: 'https://cdn.test/denia.png',
            isPrimary: true,
            origin: 'upload',
          },
          {
            id: 'slot-2',
            role: 'identity',
            url: 'https://cdn.test/denia-side.png',
            isPrimary: false,
            origin: 'upload',
          },
        ],
      },
    })
    return { card, look }
  }

  it('卡图排在用户参考图之后，分到图的角色只写图例不写描述，负面追加在最后', async () => {
    const { card, look } = await seedDenia()
    await compileAndGenerate(me.clerkId, {
      ...QUICK_INPUT,
      modelId: AI_MODELS.GEMINI_NANO_BANANA_21,
      freePrompt: 'Use @Image1 for the pose',
      referenceImages: ['https://example.com/pose.png'],
      advancedParams: { negativePrompt: 'blurry' },
      characterCardIds: [card.id],
    })
    const { job, meta } = await onlyJob()
    expect(meta.referenceImages).toEqual([
      'https://cdn.test/mirror/pose.png',
      'https://cdn.test/denia.png',
      'https://cdn.test/denia-side.png',
    ])
    expect(job.prompt).toContain('[Character: @Denia]\n\nReference images:')
    expect(job.prompt).not.toContain('red eyes')
    expect(job.prompt).toContain('Image 2 = @Denia identity (primary)')
    expect(job.prompt).toContain('reference image 1 for the pose')
    expect(meta.advancedParams).toMatchObject({
      negativePrompt: 'blurry, extra fingers',
    })
    expect(meta.characterCardIds).toEqual([card.id])
    // 出图用的造型随记录记下（角色④）。
    expect(meta.characterLookIds).toEqual({ [card.id]: look.id })
    expect(meta.studioSnapshot).toEqual({
      characterCards: [{ id: card.id, version: 3 }],
    })
  })

  it('工作台上挑了哪几张图，原样交给卡片总线（owner 09-27）', async () => {
    const { card, look } = await seedDenia()
    const generation = await db.generation.create({
      data: {
        userId: me.id,
        url: 'https://cdn.test/gen-9.png',
        storageKey: 'k/gen-9',
        outputType: 'IMAGE',
        prompt: 'p',
        model: 'm',
        provider: 'fal',
      },
    })
    await compileAndGenerate(me.clerkId, {
      ...QUICK_INPUT,
      modelId: AI_MODELS.GEMINI_NANO_BANANA_21,
      characterCardIds: [card.id],
      characterImagePicks: {
        [card.id]: [{ slotId: 'slot-2' }, { generationId: generation.id }],
      },
      characterLookIds: { [card.id]: look.id },
    })
    const { meta } = await onlyJob()
    // 只送挑的那两张、按挑的顺序；没挑的主图不送。
    expect(meta.referenceImages).toEqual([
      'https://cdn.test/denia-side.png',
      'https://cdn.test/gen-9.png',
    ])
  })

  it('没有在场角色卡时请求与原来一样', async () => {
    await seedDenia()
    await compileAndGenerate(me.clerkId, QUICK_INPUT)
    const { job, meta } = await onlyJob()
    expect(job.prompt).toBe('A studio portrait')
    expect(meta.characterCardIds).toBeUndefined()
    expect(meta.studioSnapshot).toBeUndefined()
  })
})
