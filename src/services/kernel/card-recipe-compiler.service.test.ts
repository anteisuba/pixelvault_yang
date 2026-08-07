/**
 * WP-StyleConsistency-02 · LoRA merge / dedup / Civitai token tests
 *
 * 6 paths:
 *   1. Priority ordering (char > style > styleParam > bg)
 *   2. Deduplication by URL
 *   3. 不截断：Replicate 不再砍到 1（H 条根因）
 *   4. 不截断：超过旧 FAL 上限 5 也全量放行
 *   5. Civitai token injection
 *   6. Edge: no LoRAs from any card
 *
 * ⚠ 挂载数量**没有**上限（owner 2026-08-07）。去重是唯一允许减少条目的地方；
 * 任何「砍到 N 个」的断言重新出现 = 那把尺子又长回来了。
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
import { AI_MODELS } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { compileRecipe, previewRecipe } from './card-recipe-compiler.service'
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

  // ⚠ 复现 2026-08-07 H 条：这里曾写死 `maxLoras = Replicate ? 1 : 5` 再 slice。
  // 装配台让用户挂满 3 个，编译进生成请求时却被砍到 1 个——「做同款」的多挂载在
  // 服务端悄悄失效，UI 上看不出任何异常。owner 的收法是整条截断退役（三个后端
  // 本来都不限），所以这里钉的是「一个都不许少」，不是「砍到某个正确的数」。
  it('keeps every Replicate LoRA — no longer trimmed to the hardcoded 1', async () => {
    const mounted = Array.from({ length: 6 }, (_, i) =>
      mkLora(`https://civitai.example/lora-${i}`),
    )
    mockCharFind.mockResolvedValue(mkCharCard({ loras: mounted }) as never)
    mockStyleFind.mockResolvedValue(
      mkStyleCard({
        adapterType: AI_ADAPTER_TYPES.REPLICATE,
        modelId: AI_MODELS.ILLUSTRIOUS_XL,
      }) as never,
    )
    mockBgFind.mockResolvedValue(null as never)

    const result = await compileRecipe({
      userId: 'user-1',
      characterCardId: 'char-1',
      styleCardId: 'style-1',
    })

    const loras = result.advancedParams?.loras ?? []
    expect(loras).toHaveLength(mounted.length)
    expect(loras.map((l) => l.url)).toEqual(mounted.map((l) => l.url))
  })

  // 另一头：旧代码给所有非 Replicate 的 adapter 一律 5。fal 官方文档写的是
  // 「any number of LoRAs」，所以第 6、7 个也必须原样送出去。
  it('keeps more LoRAs than the retired FAL cap of 5', async () => {
    const mounted = Array.from({ length: 7 }, (_, i) =>
      mkLora(`https://hf.co/lora-${i}`),
    )
    mockCharFind.mockResolvedValue(mkCharCard({ loras: mounted }) as never)
    mockStyleFind.mockResolvedValue(
      mkStyleCard({
        adapterType: AI_ADAPTER_TYPES.FAL,
        modelId: AI_MODELS.FLUX_LORA,
      }) as never,
    )
    mockBgFind.mockResolvedValue(null as never)

    const result = await compileRecipe({
      userId: 'user-1',
      characterCardId: 'char-1',
      styleCardId: 'style-1',
    })

    const loras = result.advancedParams?.loras ?? []
    expect(loras).toHaveLength(7)
    expect(loras[6].url).toBe('https://hf.co/lora-6')
  })

  // 上限退役后，去重是**唯一**允许减少条目的地方——跨三张卡挂满也不许再掉。
  it('lets merged LoRAs from all three cards through untrimmed', async () => {
    mockCharFind.mockResolvedValue(
      mkCharCard({
        loras: Array.from({ length: 3 }, (_, i) =>
          mkLora(`https://hf.co/char-${i}`),
        ),
      }) as never,
    )
    mockStyleFind.mockResolvedValue(
      mkStyleCard({
        adapterType: AI_ADAPTER_TYPES.RUNNER,
        modelId: AI_MODELS.ANIMA_PENCIL_XL_RUNNER,
        loras: Array.from({ length: 3 }, (_, i) =>
          mkLora(`https://r2.example/style-${i}`),
        ),
      }) as never,
    )
    mockBgFind.mockResolvedValue(
      mkBgCard({ loras: [mkLora('https://r2.example/bg-0')] }) as never,
    )

    const result = await compileRecipe({
      userId: 'user-1',
      characterCardId: 'char-1',
      styleCardId: 'style-1',
      backgroundCardId: 'bg-1',
    })

    expect(result.advancedParams?.loras ?? []).toHaveLength(7)
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
