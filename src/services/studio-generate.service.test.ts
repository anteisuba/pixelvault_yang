import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_MODELS } from '@/constants/models'
import type { StudioGenerateRequest } from '@/types'
import { GenerationValidationError } from '@/lib/errors'

vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn(),
}))

vi.mock('@/services/kernel/card-recipe-compiler.service', () => ({
  compileRecipe: vi.fn(),
}))

vi.mock('@/services/image/submit-image.service', () => ({
  submitImageGeneration: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { compileRecipe } from '@/services/kernel/card-recipe-compiler.service'
import { submitImageGeneration } from '@/services/image/submit-image.service'
import { ensureUser } from '@/services/user.service'
import { compileAndGenerate } from '@/services/studio-generate.service'

const QUICK_INPUT: StudioGenerateRequest = {
  modelId: AI_MODELS.FLUX_2_FLASH,
  freePrompt: 'A studio portrait',
  aspectRatio: '1:1',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(ensureUser).mockResolvedValue({ id: 'user-1' } as never)
  vi.mocked(submitImageGeneration).mockResolvedValue({
    jobId: 'job-1',
    requestId: 'request-1',
  })
  vi.mocked(compileRecipe).mockResolvedValue({
    compiledPrompt: 'compiled prompt',
    modelId: AI_MODELS.FLUX_2_FLASH,
    adapterType: 'fal',
    referenceImages: [],
    advancedParams: undefined,
  } as never)
})

describe('compileAndGenerate prompt limits', () => {
  it('resolves uploaded image mentions in the same order as the request images', async () => {
    await compileAndGenerate('clerk-1', {
      ...QUICK_INPUT,
      freePrompt: 'Use @Image2 for style and @Image1 for identity',
      referenceImages: [
        'https://example.com/identity.png',
        'https://example.com/style.png',
      ],
    })
    expect(submitImageGeneration).toHaveBeenCalledWith(
      'clerk-1',
      expect.objectContaining({
        prompt:
          'Use reference image 2 for style and reference image 1 for identity',
        referenceImages: [
          'https://example.com/identity.png',
          'https://example.com/style.png',
        ],
      }),
      {},
      expect.any(Object),
    )
  })

  it('rejects mentions whose uploaded reference is missing before submitting a job', async () => {
    await expect(
      compileAndGenerate('clerk-1', {
        ...QUICK_INPUT,
        freePrompt: 'Use @Image2',
        referenceImages: ['https://example.com/one.png'],
      }),
    ).rejects.toBeInstanceOf(GenerationValidationError)
    expect(submitImageGeneration).not.toHaveBeenCalled()
  })

  it('offsets uploaded reference mentions after images contributed by cards', async () => {
    vi.mocked(compileRecipe).mockResolvedValue({
      compiledPrompt: 'Card style',
      modelId: AI_MODELS.FLUX_2_FLASH,
      referenceImages: ['https://example.com/card.png'],
    } as never)
    await compileAndGenerate('clerk-1', {
      styleCardId: 'style-1',
      aspectRatio: '1:1',
      freePrompt: 'Use @Image1 for the pose',
      referenceImages: ['https://example.com/upload.png'],
    })
    expect(submitImageGeneration).toHaveBeenCalledWith(
      'clerk-1',
      expect.objectContaining({
        prompt: 'Card style\n\nUse reference image 2 for the pose',
        referenceImages: [
          'https://example.com/card.png',
          'https://example.com/upload.png',
        ],
      }),
      {},
      expect.any(Object),
    )
  })

  it('rejects quick-mode freePrompt over the resolved model maxPromptChars', async () => {
    const promise = compileAndGenerate('clerk-1', {
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
    expect(submitImageGeneration).not.toHaveBeenCalled()
  })

  // ⭐ owner 2026-08-24：模型没声明上限时**不拦**。此前兜底到
  // `CARD_RECIPE.FREE_PROMPT_MAX_LENGTH`（2000）—— 那个数的主人是卡片配方里
  // 「动作 / 姿势」那个输入框，而这条链路的真正边界是 `StudioGenerateSchema`
  // 的 `FREE_PROMPT_ABSOLUTE_MAX_LENGTH`（32000）。
  it('⭐ 模型没声明 maxPromptChars 时不拦 —— 不给未知模型编一个上限', async () => {
    // 目录里 18 个图片型号没有声明上限（Seedream / NovelAI / Illustrious …），
    // 此前它们全部被那个借来的 2000 拦着。
    await compileAndGenerate('clerk-1', {
      ...QUICK_INPUT,
      modelId: AI_MODELS.SEEDREAM_50_PRO,
      freePrompt: 'a'.repeat(2932),
    })

    expect(submitImageGeneration).toHaveBeenCalled()
  })

  it('allows quick-mode freePrompt at the resolved model maxPromptChars', async () => {
    const result = await compileAndGenerate('clerk-1', {
      ...QUICK_INPUT,
      freePrompt: 'a'.repeat(8000),
    })

    expect(result).toEqual({ jobId: 'job-1', requestId: 'request-1' })
    expect(submitImageGeneration).toHaveBeenCalledWith(
      'clerk-1',
      expect.objectContaining({
        prompt: 'a'.repeat(8000),
        modelId: AI_MODELS.FLUX_2_FLASH,
      }),
      {},
      expect.any(Object),
    )
  })

  it('does not apply the quick-mode per-model prompt gate in card mode', async () => {
    const longCardPrompt = 'a'.repeat(8001)

    const result = await compileAndGenerate('clerk-1', {
      styleCardId: 'style-card-1',
      freePrompt: longCardPrompt,
      aspectRatio: '1:1',
    })

    expect(result).toEqual({ jobId: 'job-1', requestId: 'request-1' })
    expect(compileRecipe).toHaveBeenCalledWith(
      expect.objectContaining({ freePrompt: longCardPrompt }),
    )
    expect(submitImageGeneration).toHaveBeenCalledWith(
      'clerk-1',
      expect.objectContaining({
        prompt: 'compiled prompt',
        modelId: AI_MODELS.FLUX_2_FLASH,
      }),
      {},
      expect.objectContaining({
        studioSnapshot: expect.objectContaining({
          freePrompt: longCardPrompt,
        }),
      }),
    )
  })
})

/**
 * 切片 Y 的**服务端半条** —— 助手给这一枪起的名要一路走到落库那一跳。
 *
 * ⭐ 钉的是「它搭队列元数据走」这件事：图片生成是异步的，请求这一跳只建 job，
 * 而产物名只有在几十秒后的回调里才写得进 snapshot。名字掉在这一跳的表现是
 * 「助手说这枪叫『主视觉』，出来的名字却是提示词头几个字」。
 * ⚠ 两条路（quick / card）各钉一次：它们在这个文件里是两段独立的调用。
 */
describe('compileAndGenerate 透传 displayLabel（切片 Y）', () => {
  it('quick 模式把 displayLabel 交给队列元数据', async () => {
    await compileAndGenerate('clerk-1', {
      ...QUICK_INPUT,
      displayLabel: '主视觉',
    })

    expect(submitImageGeneration).toHaveBeenCalledWith(
      'clerk-1',
      expect.any(Object),
      {},
      expect.objectContaining({ displayLabel: '主视觉' }),
    )
  })

  it('card 模式同样透传', async () => {
    await compileAndGenerate('clerk-1', {
      styleCardId: 'style-card-1',
      freePrompt: '雪原',
      aspectRatio: '1:1',
      displayLabel: '主视觉',
    })

    expect(submitImageGeneration).toHaveBeenCalledWith(
      'clerk-1',
      expect.any(Object),
      {},
      expect.objectContaining({ displayLabel: '主视觉' }),
    )
  })

  it('⚠ 没人给名字时不带这一格（⛔ 不写一个空串盖掉摘要）', async () => {
    await compileAndGenerate('clerk-1', QUICK_INPUT)

    const queueMeta = vi.mocked(submitImageGeneration).mock.calls[0]![3]
    expect(queueMeta?.displayLabel).toBeUndefined()
  })
})
