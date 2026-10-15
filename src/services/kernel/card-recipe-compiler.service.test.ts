/**
 * compileRecipe — card LoRAs stay out of Image generation (owner 2026-09-11:
 * LoRA lives in the LoRA workbench), plus the two-stage prompt compilation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ──────────────────────────────────────────────────────

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

/**
 * ⭐ 路由是**真的**（`resolveAssistantRoute` + `resolveLlmTextRoute`），只桩库与补全那一跳
 * （owner 2026-10-15「全跟助手」）：卡片融合 / 看图取材此前走自动优先级，与助手选的那一家无关。
 */
const keyStore = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findMany: vi.fn(),
  personaFindUnique: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    characterCard: { findFirst: vi.fn(), findUnique: vi.fn() },
    backgroundCard: { findFirst: vi.fn(), findUnique: vi.fn() },
    styleCard: { findFirst: vi.fn(), findUnique: vi.fn() },
    userApiKey: { findFirst: keyStore.findFirst, findMany: keyStore.findMany },
    assistantPersona: { findUnique: keyStore.personaFindUnique },
  },
}))

vi.mock('@/lib/crypto', () => ({
  decryptApiKey: (encrypted: string) => `plain:${encrypted}`,
}))

vi.mock('@/services/llm-text.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/llm-text.service')>()),
  llmTextCompletion: vi.fn(),
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
import { ASSISTANT_MODEL_CANNOT_SEE_CODE } from '@/constants/assistant-operator'
import { CARD_RECIPE_FUSION_NOTES } from '@/constants/cards/card-types'
import { LLM_TEXT_MODEL_IDS } from '@/constants/config'
import { AI_MODELS } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  compileRecipe,
  extractBackgroundAttributes,
  extractStyleAttributes,
  previewRecipe,
} from './card-recipe-compiler.service'
import { llmTextCompletion } from '@/services/llm-text.service'
import { validateRecipeFusion } from '@/lib/llm-output-validator'
import {
  assistantKey,
  seedAssistantRoute,
} from '@/test/assistant-route-fixture'
import {
  expectSelectedProviderOnly,
  keyLookupUsesOf,
  providerUsesOf,
} from '@/test/selected-provider-only'

const mockCharFind = vi.mocked(db.characterCard.findFirst)
const mockBgFind = vi.mocked(db.backgroundCard.findFirst)
const mockStyleFind = vi.mocked(db.styleCard.findFirst)
const mockLlm = vi.mocked(llmTextCompletion)
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
  seedAssistantRoute(keyStore, {
    keys: [assistantKey(AI_ADAPTER_TYPES.GEMINI, { userId: 'user-1' })],
  })
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

describe('LLM fusion input', () => {
  // owner 2026-09-27：每张卡的提示词整段进融合 —— 此前每段只取前 800 字，后面悄悄丢掉。
  it('sends each card prompt whole — no 800-character cut', async () => {
    const longCharacter = '银色长发，琥珀色的眼睛，左耳戴着月牙形耳坠。'.repeat(
      60,
    )
    mockCharFind.mockResolvedValue(
      mkCharCard({ id: 'char-long', characterPrompt: longCharacter }) as never,
    )
    mockStyleFind.mockResolvedValue(mkStyleCard({ id: 'style-long' }) as never)
    mockBgFind.mockResolvedValue(null as never)

    await compileRecipe({
      userId: 'user-1',
      characterCardId: 'char-long',
      styleCardId: 'style-long',
    })

    expect(mockLlm).toHaveBeenCalledWith(
      expect.objectContaining({
        userPrompt: expect.stringContaining(`CHARACTER: ${longCharacter}\n`),
      }),
    )
  })
})

/**
 * 「全跟助手」（owner 2026-10-15）：融合与看图取材都用助手那一家、那个型号。没 key → 融合回落
 * 模板（不花任何一家的钱）；看不了图 → 取材照实抛（建卡那边接住，用手写的那句建卡）。
 * ⛔ 都不借别家。
 */
describe('只用助手那一家', () => {
  const usesOf = () => [
    ...keyLookupUsesOf(keyStore.findFirst),
    ...providerUsesOf(mockLlm, 'card llm'),
  ]

  it('融合：「自动」挑的那一家（DeepSeek），连型号一起', async () => {
    seedAssistantRoute(keyStore, {
      keys: [
        assistantKey(AI_ADAPTER_TYPES.XAI, { userId: 'user-1' }),
        assistantKey(AI_ADAPTER_TYPES.DEEPSEEK, { userId: 'user-1' }),
      ],
    })
    mockCharFind.mockResolvedValue(mkCharCard() as never)
    mockStyleFind.mockResolvedValue(mkStyleCard() as never)
    mockBgFind.mockResolvedValue(null as never)

    await compileRecipe({
      userId: 'user-1',
      characterCardId: 'char-1',
      styleCardId: 'style-1',
    })

    expect(mockLlm.mock.calls[0]?.[0]).toMatchObject({
      modelId: LLM_TEXT_MODEL_IDS.DEEPSEEK_FLASH,
    })
    expectSelectedProviderOnly(usesOf(), {
      adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
      apiKey: `plain:enc_${AI_ADAPTER_TYPES.DEEPSEEK}`,
    })
  })

  it('融合：选了 Claude 却只有 Gemini 的 key → 回落模板，⛔ 一个字都没发给 Gemini', async () => {
    seedAssistantRoute(keyStore, {
      keys: [assistantKey(AI_ADAPTER_TYPES.GEMINI, { userId: 'user-1' })],
      routeModel: LLM_TEXT_MODEL_IDS.CLAUDE_SONNET_5_5,
    })
    mockCharFind.mockResolvedValue(mkCharCard() as never)
    mockStyleFind.mockResolvedValue(mkStyleCard() as never)
    mockBgFind.mockResolvedValue(null as never)

    const result = await compileRecipe({
      userId: 'user-1',
      characterCardId: 'char-1',
      styleCardId: 'style-1',
    })

    expect(result.compiledPrompt).toBeTruthy()
    // ⭐ 照实说一句（owner 2026-10-15：⛔ 悄悄回落模板）
    expect(result.fusionNote).toBe(CARD_RECIPE_FUSION_NOTES.noAssistantKey)
    expect(mockLlm).not.toHaveBeenCalled()
    expectSelectedProviderOnly(usesOf(), {
      adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
    })
  })

  it('融合：一把 key 都没有 → 回落模板并照实说；配好 key 后下一次就真的融合（模板不进缓存）', async () => {
    mockValidator.mockImplementation((text: string) => ({
      usable: true,
      output: text,
      reason: '',
      warnings: [],
    }))
    seedAssistantRoute(keyStore, { keys: [] })
    mockCharFind.mockResolvedValue(
      mkCharCard({ characterPrompt: 'a bard' }) as never,
    )
    mockStyleFind.mockResolvedValue(mkStyleCard() as never)
    mockBgFind.mockResolvedValue(null as never)
    const input = {
      userId: 'user-1',
      characterCardId: 'char-1',
      styleCardId: 'style-1',
      freePrompt: 'no-key-then-key',
    }

    const first = await compileRecipe(input)
    expect(first.compiledPrompt).toBe('a bard, no-key-then-key, anime style')
    expect(first.fusionNote).toBe(CARD_RECIPE_FUSION_NOTES.noAssistantKey)
    expect(mockLlm).not.toHaveBeenCalled()

    seedAssistantRoute(keyStore, {
      keys: [assistantKey(AI_ADAPTER_TYPES.GEMINI, { userId: 'user-1' })],
    })
    const second = await compileRecipe(input)
    expect(second.compiledPrompt).toBe('LLM fused prompt output')
    expect(second.fusionNote).toBeNull()
  })

  it('融合：有 key 但这一次没成（超时等）→ 安静回落模板，不报「没 key」', async () => {
    mockLlm.mockRejectedValue(new Error('LLM fusion timeout'))
    mockCharFind.mockResolvedValue(mkCharCard() as never)
    mockStyleFind.mockResolvedValue(mkStyleCard() as never)
    mockBgFind.mockResolvedValue(null as never)

    const result = await compileRecipe({
      userId: 'user-1',
      characterCardId: 'char-1',
      styleCardId: 'style-1',
      freePrompt: 'transient-failure',
    })

    expect(result.fusionNote).toBeNull()
  })

  it.each([
    ['background', extractBackgroundAttributes],
    ['style', extractStyleAttributes],
  ] as const)(
    '看图取材（%s）：选的 DeepSeek V4 Pro 看不了图 → 照实抛，⛔ 不借 Gemini',
    async (_kind, extract) => {
      seedAssistantRoute(keyStore, {
        keys: [
          assistantKey(AI_ADAPTER_TYPES.DEEPSEEK, { userId: 'user-1' }),
          assistantKey(AI_ADAPTER_TYPES.GEMINI, { userId: 'user-1' }),
        ],
        routeModel: LLM_TEXT_MODEL_IDS.DEEPSEEK_V4_PRO,
      })

      await expect(
        extract('user-1', 'data:image/png;base64,AAAA'),
      ).rejects.toMatchObject({ errorCode: ASSISTANT_MODEL_CANNOT_SEE_CODE })
      expect(mockLlm).not.toHaveBeenCalled()
      expectSelectedProviderOnly(usesOf(), {
        adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
      })
    },
  )

  it('看图取材：看得了图就用助手那一家、那个型号', async () => {
    seedAssistantRoute(keyStore, {
      keys: [
        assistantKey(AI_ADAPTER_TYPES.OPENAI, { userId: 'user-1' }),
        assistantKey(AI_ADAPTER_TYPES.ANTHROPIC, { userId: 'user-1' }),
      ],
    })
    mockLlm.mockResolvedValue('{"attributes":{},"prompt":"a forest"}')

    await extractBackgroundAttributes('user-1', 'data:image/png;base64,AAAA')

    expect(mockLlm.mock.calls[0]?.[0]).toMatchObject({
      modelId: LLM_TEXT_MODEL_IDS.OPENAI_GPT_6_1_SOL,
    })
    expectSelectedProviderOnly(usesOf(), {
      adapterType: AI_ADAPTER_TYPES.OPENAI,
    })
  })
})
