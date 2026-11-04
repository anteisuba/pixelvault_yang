import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

/**
 * ⭐ 路由是**真的**（`resolveKeyOrAssistantRoute` → `resolveAssistantRoute` /
 * `resolveLlmTextRoute`），key 与人设是真库里的行（L2a），只假补全那一跳（owner 2026-10-15
 * 「全跟助手」）：没点名 key 时润色此前走旧的自动兜底，不认助手选的型号。
 */
const mockLlmCompletion = vi.fn()
vi.mock('@/services/llm-text.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/llm-text.service')>()),
  llmTextCompletion: (...a: unknown[]) => mockLlmCompletion(...a),
}))

import { enhancePrompt } from '@/services/kernel/prompt-enhance.service'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  LLM_TEXT_MODEL_IDS,
  PROMPT_ENHANCE,
  type PromptEnhanceStyle,
} from '@/constants/config'
import { AI_MODELS } from '@/constants/models'
import { AssistantModelKeyMissingError } from '@/lib/errors'
import { db } from '@/lib/db'
import { plainKeyOf, seedAssistantKeys } from '@/test/int/assistant-keys'
import { createTestUser, resetDatabase } from '@/test/int/db'
import {
  expectSelectedProviderOnly,
  keyLookupUsesOf,
  providerUsesOf,
} from '@/test/selected-provider-only'

let userId = ''
let findFirstSpy: MockInstance

/** 这个人的 key / 人设换成这一套（真库）。 */
async function seed(setup: Parameters<typeof seedAssistantKeys>[1]) {
  await db.userApiKey.deleteMany({ where: { userId } })
  await db.assistantPersona.deleteMany({ where: { userId } })
  await seedAssistantKeys(userId, setup)
  findFirstSpy.mockClear()
}

const ORIGINAL_PROMPT = 'a cat under a tree'
const ENHANCED_REPLY =
  'A tabby cat rests beneath a gnarled oak, dappled late-afternoon sunlight filtering through layered leaves, soft chiaroscuro on the fur, subsurface scattering on the ears, shallow depth of field with 85mm compression, warm earth-tone palette, calm contemplative mood.'

describe('enhancePrompt', () => {
  beforeEach(async () => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    await resetDatabase()
    userId = (await createTestUser({ clerkId: 'clerk_1' })).id
    findFirstSpy = vi.spyOn(db.userApiKey, 'findFirst')
    await seed({
      keys: [{ adapterType: AI_ADAPTER_TYPES.GEMINI }],
    })
  })

  it.each(PROMPT_ENHANCE.STYLES)(
    'returns validated enhanced prompt for style "%s"',
    async (style: PromptEnhanceStyle) => {
      mockLlmCompletion.mockResolvedValue(ENHANCED_REPLY)

      const result = await enhancePrompt('clerk_1', ORIGINAL_PROMPT, style)

      expect(result.style).toBe(style)
      expect(result.original).toBe(ORIGINAL_PROMPT)
      expect(result.enhanced).toBe(ENHANCED_REPLY)
      expect(mockLlmCompletion).toHaveBeenCalledTimes(1)
    },
  )

  it('passes a non-empty system prompt to the LLM for every style', async () => {
    mockLlmCompletion.mockResolvedValue(ENHANCED_REPLY)

    for (const style of PROMPT_ENHANCE.STYLES) {
      mockLlmCompletion.mockClear()
      await enhancePrompt('clerk_1', ORIGINAL_PROMPT, style)

      const call = mockLlmCompletion.mock.calls[0]?.[0] as
        | { systemPrompt: string; userPrompt: string }
        | undefined
      expect(call).toBeDefined()
      expect(call?.systemPrompt.length).toBeGreaterThan(50)
      expect(call?.userPrompt).toBe(ORIGINAL_PROMPT)
    }
  })

  it('injects model-specific hint into the system prompt when modelId is provided', async () => {
    mockLlmCompletion.mockResolvedValue(ENHANCED_REPLY)

    await enhancePrompt(
      'clerk_1',
      ORIGINAL_PROMPT,
      'photorealistic',
      AI_MODELS.FLUX_2_PRO,
    )

    const call = mockLlmCompletion.mock.calls[0]?.[0] as
      | { systemPrompt: string }
      | undefined
    expect(call?.systemPrompt).toMatch(/Model-specific guidance/i)
  })

  it('swaps paragraph styles for danbooru tags when the target is NovelAI', async () => {
    mockLlmCompletion.mockResolvedValue(
      'masterpiece, best quality, 1girl, cat ears, sitting under a tree',
    )

    await enhancePrompt(
      'clerk_1',
      ORIGINAL_PROMPT,
      'photorealistic',
      AI_MODELS.NOVELAI_V5_FULL,
    )

    const call = mockLlmCompletion.mock.calls[0]?.[0] as
      | { systemPrompt: string }
      | undefined
    expect(call?.systemPrompt).toMatch(/danbooru tag list/i)
    expect(call?.systemPrompt).not.toMatch(/ONE dense paragraph/i)
    expect(call?.systemPrompt).toMatch(/Model-specific guidance/i)
  })

  it('falls back to the original prompt when the LLM output is rejected', async () => {
    // Meta-commentary that the validator will reject after stripping fails.
    mockLlmCompletion.mockResolvedValue('') // empty output → unusable

    const result = await enhancePrompt('clerk_1', ORIGINAL_PROMPT, 'detailed')

    expect(result.enhanced).toBe(ORIGINAL_PROMPT)
    expect(result.original).toBe(ORIGINAL_PROMPT)
    expect(result.style).toBe('detailed')
  })

  it('falls back to the original prompt when the LLM leaks system prompt content', async () => {
    mockLlmCompletion.mockResolvedValue(
      'You are an expert AI prompt engineer specializing in photorealism. Return only the enhanced prompt.',
    )

    const result = await enhancePrompt(
      'clerk_1',
      ORIGINAL_PROMPT,
      'photorealistic',
    )

    expect(result.enhanced).toBe(ORIGINAL_PROMPT)
  })

  it('⭐ 没点名 key = 助手那一家、那个型号（⛔ 不是顺序里排第一的 Gemini）', async () => {
    await seed({
      keys: [
        { adapterType: AI_ADAPTER_TYPES.GEMINI },
        { adapterType: AI_ADAPTER_TYPES.ANTHROPIC },
      ],
      routeModel: LLM_TEXT_MODEL_IDS.CLAUDE_SONNET_5_5,
    })
    mockLlmCompletion.mockResolvedValue(ENHANCED_REPLY)

    await enhancePrompt('clerk_1', ORIGINAL_PROMPT, 'detailed')

    expect(mockLlmCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
        apiKey: plainKeyOf(AI_ADAPTER_TYPES.ANTHROPIC),
        modelId: LLM_TEXT_MODEL_IDS.CLAUDE_SONNET_5_5,
      }),
    )
    expectSelectedProviderOnly(
      [
        ...keyLookupUsesOf(findFirstSpy),
        ...providerUsesOf(mockLlmCompletion, 'enhance'),
      ],
      {
        adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
        apiKey: plainKeyOf(AI_ADAPTER_TYPES.ANTHROPIC),
      },
    )
  })

  it('点名了一把 key：就用它，型号是那一家的默认档（照旧）', async () => {
    await seed({
      keys: [
        { adapterType: AI_ADAPTER_TYPES.GEMINI },
        { adapterType: AI_ADAPTER_TYPES.OPENAI },
      ],
    })
    mockLlmCompletion.mockResolvedValue(ENHANCED_REPLY)

    await enhancePrompt(
      'clerk_1',
      ORIGINAL_PROMPT,
      'detailed',
      undefined,
      `key_${AI_ADAPTER_TYPES.OPENAI}`,
    )

    const call = mockLlmCompletion.mock.calls[0]?.[0] as Record<string, unknown>
    expect(call).toMatchObject({
      adapterType: AI_ADAPTER_TYPES.OPENAI,
      apiKey: plainKeyOf(AI_ADAPTER_TYPES.OPENAI),
    })
    expect(call).not.toHaveProperty('modelId')
    expectSelectedProviderOnly(providerUsesOf(mockLlmCompletion, 'enhance'), {
      adapterType: AI_ADAPTER_TYPES.OPENAI,
    })
  })

  it('⛔ 助手选的那一家没 key → 照实抛，⛔ 不拿别家的 key 润色', async () => {
    await seed({
      keys: [{ adapterType: AI_ADAPTER_TYPES.GEMINI }],
      routeModel: LLM_TEXT_MODEL_IDS.CLAUDE_SONNET_5_5,
    })

    await expect(
      enhancePrompt('clerk_1', ORIGINAL_PROMPT, 'detailed'),
    ).rejects.toBeInstanceOf(AssistantModelKeyMissingError)
    expect(mockLlmCompletion).not.toHaveBeenCalled()
  })
})
