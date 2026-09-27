import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const mockEnsureUser = vi.fn()
vi.mock('@/services/user.service', () => ({
  ensureUser: (...a: unknown[]) => mockEnsureUser(...a),
}))

const mockLlmCompletion = vi.fn()
const mockResolveLlmRoute = vi.fn()
vi.mock('@/services/llm-text.service', () => ({
  llmTextCompletion: (...a: unknown[]) => mockLlmCompletion(...a),
  resolveLlmTextRoute: (...a: unknown[]) => mockResolveLlmRoute(...a),
}))

const mockCheckTags = vi.fn()
vi.mock('@/services/novelai-tags.service', () => ({
  checkNovelAiPromptTags: (...a: unknown[]) => mockCheckTags(...a),
}))

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { ApiRequestError } from '@/lib/errors'
import { translatePromptToTags } from '@/services/kernel/prompt-to-tags.service'

const FAKE_ROUTE = {
  adapterType: AI_ADAPTER_TYPES.GEMINI,
  providerConfig: { label: 'Gemini', baseUrl: 'https://example.test' },
  apiKey: 'test-key',
}

describe('translatePromptToTags', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue({ id: 'db_user_1' })
    mockResolveLlmRoute.mockResolvedValue(FAKE_ROUTE)
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
})
