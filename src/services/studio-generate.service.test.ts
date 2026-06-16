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
