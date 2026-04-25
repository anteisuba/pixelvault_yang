/**
 * WP-StyleConsistency-02 · LoRA merge / dedup / Civitai token tests
 *
 * 6 paths:
 *   1. Priority ordering (char > style > styleParam > bg)
 *   2. Deduplication by URL
 *   3. FAL adapter: max 5 LoRAs
 *   4. Replicate adapter: max 1 LoRA
 *   5. Civitai token injection
 *   6. Edge: no LoRAs from any card
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

vi.mock('@/services/civitai-token.service', () => ({
  getCivitaiTokenByInternalUserId: vi.fn(),
  injectCivitaiToken: vi.fn((url: string, token: string) => {
    if (!url.includes('civitai.com')) return url
    const u = new URL(url)
    u.searchParams.set('token', token)
    return u.toString()
  }),
}))

import { db } from '@/lib/db'
import { compileRecipe, previewRecipe } from './recipe-compiler.service'
import { getCivitaiTokenByInternalUserId } from '@/services/civitai-token.service'
import {
  llmTextCompletion,
  resolveLlmTextRoute,
} from '@/services/llm-text.service'
import { validateRecipeFusion } from '@/lib/llm-output-validator'

const mockCharFind = vi.mocked(db.characterCard.findFirst)
const mockBgFind = vi.mocked(db.backgroundCard.findFirst)
const mockStyleFind = vi.mocked(db.styleCard.findFirst)
const mockCivitaiToken = vi.mocked(getCivitaiTokenByInternalUserId)
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
  mockCivitaiToken.mockResolvedValue(null)
})

// ─── Tests ──────────────────────────────────────────────────────

describe('LoRA merge in compileRecipe', () => {
  it('preserves priority: char > style > styleParam > bg', async () => {
    mockCharFind.mockResolvedValue(
      mkCharCard({ loras: [mkLora('https://hf.co/char-lora', 0.8)] }) as never,
    )
    mockStyleFind.mockResolvedValue(
      mkStyleCard({
        loras: [mkLora('https://hf.co/style-lora', 0.6)],
      }) as never,
    )
    mockBgFind.mockResolvedValue(
      mkBgCard({ loras: [mkLora('https://hf.co/bg-lora', 0.4)] }) as never,
    )

    const result = await compileRecipe({
      userId: 'user-1',
      characterCardId: 'char-1',
      styleCardId: 'style-1',
      backgroundCardId: 'bg-1',
    })

    const loras = result.advancedParams?.loras ?? []
    expect(loras).toHaveLength(3)
    expect(loras[0].url).toBe('https://hf.co/char-lora')
    expect(loras[1].url).toBe('https://hf.co/style-lora')
    expect(loras[2].url).toBe('https://hf.co/bg-lora')
  })

  it('deduplicates by URL (first occurrence wins)', async () => {
    const sharedUrl = 'https://hf.co/shared-lora'
    mockCharFind.mockResolvedValue(
      mkCharCard({ loras: [mkLora(sharedUrl, 0.8)] }) as never,
    )
    mockStyleFind.mockResolvedValue(
      mkStyleCard({ loras: [mkLora(sharedUrl, 0.3)] }) as never,
    )
    mockBgFind.mockResolvedValue(null as never)

    const result = await compileRecipe({
      userId: 'user-1',
      characterCardId: 'char-1',
      styleCardId: 'style-1',
    })

    const loras = result.advancedParams?.loras ?? []
    expect(loras).toHaveLength(1)
    expect(loras[0].scale).toBe(0.8) // char's scale wins
  })

  it('trims to 5 LoRAs for FAL adapter', async () => {
    const sixLoras = Array.from({ length: 6 }, (_, i) =>
      mkLora(`https://hf.co/lora-${i}`),
    )
    mockCharFind.mockResolvedValue(mkCharCard({ loras: sixLoras }) as never)
    mockStyleFind.mockResolvedValue(
      mkStyleCard({ adapterType: 'fal' }) as never,
    )
    mockBgFind.mockResolvedValue(null as never)

    const result = await compileRecipe({
      userId: 'user-1',
      characterCardId: 'char-1',
      styleCardId: 'style-1',
    })

    const loras = result.advancedParams?.loras ?? []
    expect(loras).toHaveLength(5)
    expect(loras[4].url).toBe('https://hf.co/lora-4')
  })

  it('trims to 1 LoRA for Replicate adapter', async () => {
    mockCharFind.mockResolvedValue(
      mkCharCard({
        loras: [mkLora('https://hf.co/first'), mkLora('https://hf.co/second')],
      }) as never,
    )
    mockStyleFind.mockResolvedValue(
      mkStyleCard({ adapterType: 'replicate' }) as never,
    )
    mockBgFind.mockResolvedValue(null as never)

    const result = await compileRecipe({
      userId: 'user-1',
      characterCardId: 'char-1',
      styleCardId: 'style-1',
    })

    const loras = result.advancedParams?.loras ?? []
    expect(loras).toHaveLength(1)
    expect(loras[0].url).toBe('https://hf.co/first')
  })

  it('injects Civitai token into matching URLs', async () => {
    mockCharFind.mockResolvedValue(
      mkCharCard({
        loras: [
          mkLora('https://civitai.com/api/download/models/12345'),
          mkLora('https://hf.co/non-civitai'),
        ],
      }) as never,
    )
    mockStyleFind.mockResolvedValue(mkStyleCard() as never)
    mockBgFind.mockResolvedValue(null as never)
    mockCivitaiToken.mockResolvedValue('test-token-abc')

    const result = await compileRecipe({
      userId: 'user-1',
      characterCardId: 'char-1',
      styleCardId: 'style-1',
    })

    const loras = result.advancedParams?.loras ?? []
    expect(loras).toHaveLength(2)
    expect(loras[0].url).toContain('token=test-token-abc')
    // Non-civitai URL gets token param too via map (injectCivitaiToken skips it)
    expect(loras[1].url).toBe('https://hf.co/non-civitai')
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
