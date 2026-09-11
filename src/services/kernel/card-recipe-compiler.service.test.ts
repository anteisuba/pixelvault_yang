/**
 * compileRecipe — card LoRAs stay out of Image generation (owner 2026-09-11:
 * LoRA lives in the LoRA workbench), plus the two-stage prompt compilation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ──────────────────────────────────────────────────────

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/lib/db', () => ({
  db: {
    characterCard: { findFirst: vi.fn(), findUnique: vi.fn() },
    backgroundCard: { findFirst: vi.fn(), findUnique: vi.fn() },
    styleCard: { findFirst: vi.fn(), findUnique: vi.fn() },
  },
}))

vi.mock('@/services/llm-text.service', () => ({
  llmTextCompletion: vi.fn(),
  resolveLlmTextRoute: vi.fn(),
}))

vi.mock('@/lib/llm-output-validator', () => ({
  validateRecipeFusion: vi.fn((text: string) => ({
    usable: true,
    output: text,
    reason: '',
    warnings: [],
  })),
}))

import { db } from '@/lib/db'
import { AI_MODELS } from '@/constants/models'
import { compileRecipe, previewRecipe } from './card-recipe-compiler.service'
import {
  llmTextCompletion,
  resolveLlmTextRoute,
} from '@/services/llm-text.service'
import { validateRecipeFusion } from '@/lib/llm-output-validator'

const mockCharFind = vi.mocked(db.characterCard.findFirst)
const mockBgFind = vi.mocked(db.backgroundCard.findFirst)
const mockStyleFind = vi.mocked(db.styleCard.findFirst)
const mockLlm = vi.mocked(llmTextCompletion)
const mockLlmRoute = vi.mocked(resolveLlmTextRoute)
const mockValidator = vi.mocked(validateRecipeFusion)

// ─── Fixtures ───────────────────────────────────────────────────

const mkLora = (url: string, scale = 1.0) => ({ url, scale })

const mkStyleCard = (overrides: Record<string, unknown> = {}) => ({
  id: 'style-1',
  name: 'Test Style',
  userId: 'user-1',
  prompt: 'anime style',
  stylePrompt: 'anime style',
  modelId: 'fal-ai/flux-2-pro',
  adapterType: 'fal',
  loras: [],
  advancedParams: null,
  sourceImageUrl: null,
  attributes: null,
  ...overrides,
})

const mkCharCard = (overrides: Record<string, unknown> = {}) => ({
  id: 'char-1',
  name: 'Test Char',
  userId: 'user-1',
  prompt: 'a warrior',
  loras: [],
  sourceImageUrl: null,
  referenceImages: [],
  attributes: null,
  ...overrides,
})

const mkBgCard = (overrides: Record<string, unknown> = {}) => ({
  id: 'bg-1',
  name: 'Test BG',
  userId: 'user-1',
  prompt: 'forest',
  loras: [],
  sourceImageUrl: null,
  ...overrides,
})

// ─── Setup ──────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  mockLlmRoute.mockResolvedValue({
    adapterType: 'gemini',
    apiKey: 'test-key',
    providerConfig: { label: 'Gemini', baseUrl: 'https://api.gemini' },
  } as never)
  mockLlm.mockResolvedValue('LLM fused prompt output')
})

// ─── Tests ──────────────────────────────────────────────────────

describe('card LoRAs in compileRecipe', () => {
  it('does not forward LoRAs stored on any card', async () => {
    mockCharFind.mockResolvedValue(
      mkCharCard({ loras: [mkLora('https://hf.co/char-lora', 0.8)] }) as never,
    )
    mockStyleFind.mockResolvedValue(
      mkStyleCard({
        loras: [mkLora('https://hf.co/style-lora')],
        advancedParams: {
          guidanceScale: 7,
          loras: [mkLora('https://hf.co/param-lora')],
        },
      }) as never,
    )
    mockBgFind.mockResolvedValue(
      mkBgCard({ loras: [mkLora('https://hf.co/bg-lora')] }) as never,
    )

    const result = await compileRecipe({
      userId: 'user-1',
      characterCardId: 'char-1',
      styleCardId: 'style-1',
      backgroundCardId: 'bg-1',
    })

    expect(result.advancedParams?.loras).toBeUndefined()
    expect(result.advancedParams?.guidanceScale).toBe(7)
  })

  it('returns base advancedParams unchanged when no LoRAs', async () => {
    mockCharFind.mockResolvedValue(null as never)
    mockStyleFind.mockResolvedValue(
      mkStyleCard({ advancedParams: { guidanceScale: 7 } }) as never,
    )
    mockBgFind.mockResolvedValue(null as never)

    const result = await compileRecipe({
      userId: 'user-1',
      styleCardId: 'style-1',
    })

    expect(result.advancedParams?.loras).toBeUndefined()
    expect(result.advancedParams?.guidanceScale).toBe(7)
  })

  it.each([
    AI_MODELS.FLUX_LORA,
    AI_MODELS.ILLUSTRIOUS_XL,
    AI_MODELS.ANIMA_DIT_RUNNER,
    AI_MODELS.FLUX_KONTEXT_MAX,
  ])(
    'makes a style card saved on non-generation entry %s re-pick a model',
    async (modelId) => {
      mockCharFind.mockResolvedValue(null as never)
      mockStyleFind.mockResolvedValue(
        mkStyleCard({ modelId, adapterType: 'fal' }) as never,
      )
      mockBgFind.mockResolvedValue(null as never)

      await expect(
        compileRecipe({ userId: 'user-1', styleCardId: 'style-1' }),
      ).rejects.toThrow('MISSING_MODEL_IN_STYLE')
    },
  )
})

// ─── WP-StyleConsistency-01 · compileRecipe two-stage tests ─────

describe('compileRecipe two-stage compilation', () => {
  it('uses LLM fusion output when available', async () => {
    mockCharFind.mockResolvedValue(
      mkCharCard({ characterPrompt: 'a knight' }) as never,
    )
    mockStyleFind.mockResolvedValue(
      mkStyleCard({ stylePrompt: 'oil painting' }) as never,
    )
    mockBgFind.mockResolvedValue(null as never)

    const result = await compileRecipe({
      userId: 'user-1',
      characterCardId: 'char-1',
      styleCardId: 'style-1',
      freePrompt: 'llm-success-test',
    })

    expect(mockLlm).toHaveBeenCalledOnce()
    expect(result.compiledPrompt).toBe('LLM fused prompt output')
  })

  it('falls back to template when LLM returns null', async () => {
    mockLlm.mockResolvedValue(null as never)
    mockCharFind.mockResolvedValue(
      mkCharCard({ characterPrompt: 'a warrior' }) as never,
    )
    mockStyleFind.mockResolvedValue(
      mkStyleCard({ stylePrompt: 'watercolor' }) as never,
    )
    mockBgFind.mockResolvedValue(
      mkBgCard({ backgroundPrompt: 'forest' }) as never,
    )

    const result = await compileRecipe({
      userId: 'user-1',
      characterCardId: 'char-1',
      styleCardId: 'style-1',
      backgroundCardId: 'bg-1',
      freePrompt: 'llm-null-test',
    })

    // Template: char, free, bg, style joined by ', '
    expect(result.compiledPrompt).toBe(
      'a warrior, llm-null-test, forest, watercolor',
    )
  })

  it('falls back to template when LLM throws', async () => {
    mockLlm.mockRejectedValue(new Error('LLM fusion timeout'))
    mockCharFind.mockResolvedValue(
      mkCharCard({ characterPrompt: 'elf' }) as never,
    )
    mockStyleFind.mockResolvedValue(mkStyleCard() as never)
    mockBgFind.mockResolvedValue(null as never)

    const result = await compileRecipe({
      userId: 'user-1',
      characterCardId: 'char-1',
      styleCardId: 'style-1',
      freePrompt: 'llm-throw-test',
    })

    // Template fallback
    expect(result.compiledPrompt).toBe('elf, llm-throw-test, anime style')
  })

  it('falls back to template when validation rejects', async () => {
    mockValidator.mockReturnValue({
      usable: false,
      output: '',
      reason: 'Character keywords lost',
      warnings: [],
    } as never)
    mockCharFind.mockResolvedValue(
      mkCharCard({ characterPrompt: 'samurai' }) as never,
    )
    mockStyleFind.mockResolvedValue(
      mkStyleCard({ stylePrompt: 'cyberpunk' }) as never,
    )
    mockBgFind.mockResolvedValue(null as never)

    const result = await compileRecipe({
      userId: 'user-1',
      characterCardId: 'char-1',
      styleCardId: 'style-1',
      freePrompt: 'validation-reject-test',
    })

    expect(result.compiledPrompt).toBe(
      'samurai, validation-reject-test, cyberpunk',
    )
  })

  it('includes freePrompt in template output', async () => {
    mockLlm.mockResolvedValue(null as never)
    mockCharFind.mockResolvedValue(null as never)
    mockStyleFind.mockResolvedValue(mkStyleCard() as never)
    mockBgFind.mockResolvedValue(null as never)

    const result = await compileRecipe({
      userId: 'user-1',
      styleCardId: 'style-1',
      freePrompt: 'standing on cliff unique',
    })

    expect(result.compiledPrompt).toBe('standing on cliff unique, anime style')
  })

  it('returns modelId and adapterType from styleCard', async () => {
    mockCharFind.mockResolvedValue(null as never)
    mockStyleFind.mockResolvedValue(
      mkStyleCard({
        modelId: 'custom-model',
        adapterType: 'replicate',
      }) as never,
    )
    mockBgFind.mockResolvedValue(null as never)

    const result = await compileRecipe({
      userId: 'user-1',
      styleCardId: 'style-1',
      freePrompt: 'test',
    })

    expect(result.modelId).toBe('custom-model')
    expect(result.adapterType).toBe('replicate')
  })

  it('throws when styleCard has no modelId', async () => {
    mockCharFind.mockResolvedValue(null as never)
    mockStyleFind.mockResolvedValue(
      mkStyleCard({ modelId: null, adapterType: null }) as never,
    )
    mockBgFind.mockResolvedValue(null as never)

    await expect(
      compileRecipe({ userId: 'user-1', styleCardId: 'style-1' }),
    ).rejects.toThrow('MISSING_MODEL_IN_STYLE')
  })
})

describe('previewRecipe', () => {
  it('returns a template-compiled prompt without LLM', async () => {
    vi.clearAllMocks()
    mockStyleFind.mockResolvedValue(
      mkStyleCard({ stylePrompt: 'watercolor painting' }) as never,
    )
    mockCharFind.mockResolvedValue(null as never)
    mockBgFind.mockResolvedValue(null as never)

    const result = await previewRecipe({
      userId: 'user-1',
      styleCardId: 'style-1',
      freePrompt: 'running in rain',
    })

    expect(mockLlm).not.toHaveBeenCalled()
    expect(result).toContain('watercolor')
    expect(result).toContain('running in rain')
  })
})
