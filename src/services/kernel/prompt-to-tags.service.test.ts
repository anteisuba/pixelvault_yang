import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const mockEnsureUser = vi.fn()
vi.mock('@/services/user.service', () => ({
  ensureUser: (...a: unknown[]) => mockEnsureUser(...a),
}))

/**
 * ⭐ 路由是**真的**（`resolveAssistantRoute` + `resolveLlmTextRoute`），只桩库与补全那一跳
 * （owner 2026-10-15「全跟助手」）：标签台翻译此前就是在路由里悄悄换了一家。
 */
const keyStore = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findMany: vi.fn(),
  personaFindUnique: vi.fn(),
}))
vi.mock('@/lib/db', () => ({
  db: {
    userApiKey: { findFirst: keyStore.findFirst, findMany: keyStore.findMany },
    assistantPersona: { findUnique: keyStore.personaFindUnique },
  },
}))
vi.mock('@/lib/crypto', () => ({
  decryptApiKey: (encrypted: string) => `plain:${encrypted}`,
}))

const mockLlmCompletion = vi.fn()
vi.mock('@/services/llm-text.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/llm-text.service')>()),
  llmTextCompletion: (...a: unknown[]) => mockLlmCompletion(...a),
}))

const mockCheckTags = vi.fn()
vi.mock('@/services/novelai-tags.service', () => ({
  checkNovelAiPromptTags: (...a: unknown[]) => mockCheckTags(...a),
}))

import { ASSISTANT_OPERATOR_MODEL_KEY_MISSING_CODE } from '@/constants/assistant-operator'
import { LLM_TEXT_MODEL_IDS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { ApiRequestError } from '@/lib/errors'
import { translatePromptToTags } from '@/services/kernel/prompt-to-tags.service'
import {
  assistantKey,
  seedAssistantRoute,
} from '@/test/assistant-route-fixture'
import {
  expectSelectedProviderOnly,
  keyLookupUsesOf,
  providerUsesOf,
} from '@/test/selected-provider-only'

describe('translatePromptToTags', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue({ id: 'db_user_1' })
    seedAssistantRoute(keyStore, {
      keys: [assistantKey(AI_ADAPTER_TYPES.GEMINI)],
    })
    mockCheckTags.mockImplementation(
      async ({ prompt }: { prompt: string }) => ({
        prompt,
        fixes: [],
        unknown: [],
      }),
    )
  })

  it('sends the sentence as-is and returns the cleaned tag list', async () => {
    mockLlmCompletion.mockResolvedValue('Tags: 1girl, solo, rain, looking_up')

    const result = await translatePromptToTags('clerk_1', {
      prompt: '一个女孩在雨里抬头看',
    })

    expect(result).toEqual({ tags: '1girl, solo, rain, looking up' })
    const call = mockLlmCompletion.mock.calls[0]?.[0] as {
      systemPrompt: string
      userPrompt: string
    }
    expect(call.userPrompt).toBe('一个女孩在雨里抬头看')
    // 直译不润色：系统提示明说不加质量词。
    expect(call.systemPrompt).toMatch(/Do NOT add quality tags/)
  })

  it('runs the translated tags through the tag check with the selected model', async () => {
    mockLlmCompletion.mockResolvedValue('1girl, schol uniform')
    mockCheckTags.mockResolvedValue({
      prompt: '1girl, school uniform',
      fixes: [{ from: 'schol uniform', to: 'school uniform' }],
      unknown: [],
    })

    const result = await translatePromptToTags('clerk_1', {
      prompt: 'a schoolgirl',
      modelId: 'nai-diffusion-4-5-full',
    })

    expect(result).toEqual({ tags: '1girl, school uniform' })
    expect(mockCheckTags).toHaveBeenCalledWith({
      userId: 'db_user_1',
      modelId: 'nai-diffusion-4-5-full',
      prompt: '1girl, schol uniform',
    })
  })

  it('keeps the translation when the tag check fails', async () => {
    mockLlmCompletion.mockResolvedValue('1girl, rain')
    mockCheckTags.mockRejectedValue(new Error('lookup down'))

    await expect(
      translatePromptToTags('clerk_1', { prompt: 'a girl in the rain' }),
    ).resolves.toEqual({ tags: '1girl, rain' })
  })

  it('rejects a reply that is a paragraph instead of tags', async () => {
    mockLlmCompletion.mockResolvedValue(
      '这是一幅描绘女孩在雨中抬头仰望天空的画面，氛围安静而忧郁。',
    )

    const error = await translatePromptToTags('clerk_1', {
      prompt: 'a girl in the rain',
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiRequestError)
    expect(error).toMatchObject({
      errorCode: 'PROMPT_TAGS_UNUSABLE',
      i18nKey: 'errors.promptTags.unusable',
    })
    expect(mockCheckTags).not.toHaveBeenCalled()
  })

  /**
   * 「全跟助手」（owner 2026-10-15）：翻译用的是助手那一家、那个型号 —— 选定的，或「自动」挑的
   * （chip 上写的那个）。⛔ 不悄悄换一家。
   */
  describe('只用助手那一家', () => {
    it('「自动」：顺序里第一家配了 key 的（DeepSeek），连型号一起', async () => {
      seedAssistantRoute(keyStore, {
        keys: [
          assistantKey(AI_ADAPTER_TYPES.ANTHROPIC),
          assistantKey(AI_ADAPTER_TYPES.DEEPSEEK),
        ],
      })
      mockLlmCompletion.mockResolvedValue('1girl, rain')

      await translatePromptToTags('clerk_1', { prompt: 'a girl in the rain' })

      expect(mockLlmCompletion.mock.calls[0]?.[0]).toMatchObject({
        modelId: LLM_TEXT_MODEL_IDS.DEEPSEEK_FLASH,
      })
      expectSelectedProviderOnly(
        [
          ...keyLookupUsesOf(keyStore.findFirst),
          ...providerUsesOf(mockLlmCompletion, 'tag translation'),
        ],
        {
          adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
          apiKey: `plain:enc_${AI_ADAPTER_TYPES.DEEPSEEK}`,
        },
      )
    })

    it('选了 Claude 却只有 Gemini 的 key → 照实报那句错，⛔ 一个字都没发给 Gemini', async () => {
      seedAssistantRoute(keyStore, {
        keys: [assistantKey(AI_ADAPTER_TYPES.GEMINI)],
        routeModel: LLM_TEXT_MODEL_IDS.CLAUDE_SONNET_5_5,
      })

      await expect(
        translatePromptToTags('clerk_1', { prompt: 'a girl in the rain' }),
      ).rejects.toMatchObject({
        errorCode: ASSISTANT_OPERATOR_MODEL_KEY_MISSING_CODE,
        i18nKey: 'errors.assistant.modelKeyMissing',
      })
      expect(mockLlmCompletion).not.toHaveBeenCalled()
      expectSelectedProviderOnly(
        [
          ...keyLookupUsesOf(keyStore.findFirst),
          ...providerUsesOf(mockLlmCompletion, 'tag translation'),
        ],
        { adapterType: AI_ADAPTER_TYPES.ANTHROPIC },
      )
    })
  })
})
