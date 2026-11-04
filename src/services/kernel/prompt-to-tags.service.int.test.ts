import {
  afterEach,
  describe,
  it,
  expect,
  vi,
  beforeEach,
  type MockInstance,
} from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

/**
 * ⭐ 路由是**真的**（`resolveAssistantRoute` + `resolveLlmTextRoute`），key 与人设是真库里的行
 * （L2a），只假补全那一跳与 NovelAI 联想的网络（owner 2026-10-15「全跟助手」）：标签台翻译此前
 * 就是在路由里悄悄换了一家。
 */

const mockLlmCompletion = vi.fn()
vi.mock('@/services/llm-text.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/llm-text.service')>()),
  llmTextCompletion: (...a: unknown[]) => mockLlmCompletion(...a),
}))

/** NovelAI 官方联想（标签核对查本地词表查不到的那几个）：只假网络。 */
const naiSuggest = vi.fn<(prompt: string) => Promise<Response>>()

import { ASSISTANT_OPERATOR_MODEL_KEY_MISSING_CODE } from '@/constants/assistant-operator'
import { LLM_TEXT_MODEL_IDS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { ApiRequestError } from '@/lib/errors'
import { translatePromptToTags } from '@/services/kernel/prompt-to-tags.service'
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

describe('translatePromptToTags', () => {
  beforeEach(async () => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    await resetDatabase()
    userId = (await createTestUser({ clerkId: 'clerk_1' })).id
    findFirstSpy = vi.spyOn(db.userApiKey, 'findFirst')
    await seed({
      keys: [{ adapterType: AI_ADAPTER_TYPES.GEMINI }],
    })
    naiSuggest.mockResolvedValue(Response.json({ tags: [] }))
    vi.stubGlobal('fetch', (input: string | URL) => {
      const url = new URL(String(input))
      if (!url.pathname.endsWith('/suggest-tags'))
        throw new Error(`unexpected fetch ${url.href}`)
      return naiSuggest(url.searchParams.get('prompt') ?? '')
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
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
    // 本地词表查不到的那个，用这个人自己的 NovelAI key 问官方联想。
    await seedAssistantKeys(userId, {
      keys: [{ adapterType: AI_ADAPTER_TYPES.NOVELAI }],
    })
    mockLlmCompletion.mockResolvedValue('1girl, schol uniform')
    naiSuggest.mockImplementation(async (prompt) =>
      Response.json({
        tags:
          prompt === 'schol uniform'
            ? [{ tag: 'school uniform', count: 900000, confidence: 0.9 }]
            : [],
      }),
    )

    const result = await translatePromptToTags('clerk_1', {
      prompt: 'a schoolgirl',
      modelId: 'nai-diffusion-4-5-full',
    })

    expect(result).toEqual({ tags: '1girl, school uniform' })
  })

  it('keeps the translation when the tag check fails', async () => {
    await seedAssistantKeys(userId, {
      keys: [{ adapterType: AI_ADAPTER_TYPES.NOVELAI }],
    })
    mockLlmCompletion.mockResolvedValue('1girl, raiin')
    naiSuggest.mockRejectedValue(new TypeError('fetch failed'))

    await expect(
      translatePromptToTags('clerk_1', {
        prompt: 'a girl in the rain',
        modelId: 'nai-diffusion-4-5-full',
      }),
    ).resolves.toEqual({ tags: '1girl, raiin' })
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
    expect(naiSuggest).not.toHaveBeenCalled()
  })

  /**
   * 「全跟助手」（owner 2026-10-15）：翻译用的是助手那一家、那个型号 —— 选定的，或「自动」挑的
   * （chip 上写的那个）。⛔ 不悄悄换一家。
   */
  describe('只用助手那一家', () => {
    it('「自动」：顺序里第一家配了 key 的（DeepSeek），连型号一起', async () => {
      await seed({
        keys: [
          { adapterType: AI_ADAPTER_TYPES.ANTHROPIC },
          { adapterType: AI_ADAPTER_TYPES.DEEPSEEK },
        ],
      })
      mockLlmCompletion.mockResolvedValue('1girl, rain')

      await translatePromptToTags('clerk_1', { prompt: 'a girl in the rain' })

      expect(mockLlmCompletion.mock.calls[0]?.[0]).toMatchObject({
        modelId: LLM_TEXT_MODEL_IDS.DEEPSEEK_FLASH,
      })
      expectSelectedProviderOnly(
        [
          ...keyLookupUsesOf(findFirstSpy),
          ...providerUsesOf(mockLlmCompletion, 'tag translation'),
        ],
        {
          adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
          apiKey: plainKeyOf(AI_ADAPTER_TYPES.DEEPSEEK),
        },
      )
    })

    it('选了 Claude 却只有 Gemini 的 key → 照实报那句错，⛔ 一个字都没发给 Gemini', async () => {
      await seed({
        keys: [{ adapterType: AI_ADAPTER_TYPES.GEMINI }],
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
          ...keyLookupUsesOf(findFirstSpy),
          ...providerUsesOf(mockLlmCompletion, 'tag translation'),
        ],
        { adapterType: AI_ADAPTER_TYPES.ANTHROPIC },
      )
    })
  })
})
