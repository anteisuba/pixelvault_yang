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

const mockBuildInspirationContext = vi.fn()
vi.mock('@/services/inspiration.service', () => ({
  buildInspirationContext: (...a: unknown[]) =>
    mockBuildInspirationContext(...a),
}))

import { chatPromptAssistant } from '@/services/prompt-assistant.service'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

const FAKE_USER = { id: 'db_user_1', clerkId: 'clerk_1' }
const FAKE_ROUTE = {
  adapterType: AI_ADAPTER_TYPES.GEMINI,
  providerConfig: {
    label: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
  },
  apiKey: 'test-key',
}

describe('chatPromptAssistant', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockResolveLlmRoute.mockResolvedValue(FAKE_ROUTE)
    mockBuildInspirationContext.mockResolvedValue('')
  })

  it('extracts prompt from a code block in the LLM response', async () => {
    mockLlmCompletion.mockResolvedValue(
      'Here is your prompt:\n\n```\na cat sitting under a tree, golden hour lighting\n```',
    )

    const result = await chatPromptAssistant('clerk_1', [
      { role: 'user', content: 'a cat under a tree' },
    ])

    expect(result.prompt).toBe(
      'a cat sitting under a tree, golden hour lighting',
    )
  })

  it('falls back to raw text when no code block is present', async () => {
    mockLlmCompletion.mockResolvedValue(
      'a cat sitting under a tree, golden hour lighting',
    )

    const result = await chatPromptAssistant('clerk_1', [
      { role: 'user', content: 'a cat under a tree' },
    ])

    expect(result.prompt).toContain('cat')
  })

  it('passes requested response language into the system prompt', async () => {
    mockLlmCompletion.mockResolvedValue('```\n柔和光线下的猫\n```')

    await chatPromptAssistant(
      'clerk_1',
      [{ role: 'user', content: 'a cat' }],
      undefined,
      undefined,
      undefined,
      undefined,
      'chinese',
    )

    expect(mockLlmCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompt: expect.stringContaining('Simplified Chinese'),
      }),
    )
  })

  it('uses LoRA conversion rules when requested', async () => {
    mockLlmCompletion.mockResolvedValue(
      '```\naugusta, 1girl, wearing outfit from reference image, blue dress, masterpiece, best quality\n```',
    )

    await chatPromptAssistant(
      'clerk_1',
      [{ role: 'user', content: '让这个角色穿参考图的衣服' }],
      'illustrious-xl',
      'data:image/png;base64,abc',
      'augusta',
      undefined,
      'chinese',
      'lora',
    )

    expect(mockLlmCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        imageData: 'data:image/png;base64,abc',
        systemPrompt: expect.stringContaining('LoRA-ready positive prompt'),
        userPrompt: expect.stringContaining(
          '[Current prompt in the editor]: augusta',
        ),
      }),
    )
    const call = mockLlmCompletion.mock.calls[0]?.[0] as {
      systemPrompt: string
    }
    expect(call.systemPrompt).toContain('Output the prompt in English')
    expect(call.systemPrompt).toContain('Preserve existing LoRA trigger words')
    expect(call.systemPrompt).not.toContain('Simplified Chinese')
  })

  // ── RAG: useInspirationContext ─────────────────────────────────

  it('does NOT query the inspiration library when useInspirationContext is false', async () => {
    mockLlmCompletion.mockResolvedValue('```\na sleepy cat\n```')

    await chatPromptAssistant(
      'clerk_1',
      [{ role: 'user', content: 'a cat under a tree' }],
      undefined,
      undefined,
      undefined,
      undefined,
      'english',
      'general',
      false,
    )

    expect(mockBuildInspirationContext).not.toHaveBeenCalled()
  })

  it('injects inspiration context into the system prompt on the first turn', async () => {
    const INSPIRATION_BLOCK =
      '\n\n# Reference Examples (from a curated prompt library)\n... Example 1: dramatic cat scene ...'
    mockBuildInspirationContext.mockResolvedValue(INSPIRATION_BLOCK)
    mockLlmCompletion.mockResolvedValue('```\na cat in golden hour\n```')

    await chatPromptAssistant(
      'clerk_1',
      [{ role: 'user', content: 'a cat under a tree' }],
      undefined,
      undefined,
      undefined,
      undefined,
      'english',
      'general',
      true,
    )

    expect(mockBuildInspirationContext).toHaveBeenCalledWith(
      'a cat under a tree',
    )
    const call = mockLlmCompletion.mock.calls[0]?.[0] as {
      systemPrompt: string
    }
    expect(call.systemPrompt).toContain('Reference Examples')
    expect(call.systemPrompt).toContain('dramatic cat scene')
  })

  it('does NOT inject inspiration context on follow-up turns', async () => {
    mockLlmCompletion.mockResolvedValue('```\nrefined prompt\n```')

    await chatPromptAssistant(
      'clerk_1',
      [
        { role: 'user', content: 'a cat under a tree' },
        { role: 'assistant', content: 'A tabby cat resting beneath...' },
        { role: 'user', content: 'make it more dramatic' },
      ],
      undefined,
      undefined,
      undefined,
      undefined,
      'english',
      'general',
      true,
    )

    expect(mockBuildInspirationContext).not.toHaveBeenCalled()
  })

  it('prefers currentPrompt over the first message when seeding inspiration lookup', async () => {
    mockBuildInspirationContext.mockResolvedValue('')
    mockLlmCompletion.mockResolvedValue('```\nok\n```')

    await chatPromptAssistant(
      'clerk_1',
      [{ role: 'user', content: 'make it cinematic' }],
      undefined,
      undefined,
      'an existing prompt about a cat',
      undefined,
      'english',
      'general',
      true,
    )

    expect(mockBuildInspirationContext).toHaveBeenCalledWith(
      'an existing prompt about a cat',
    )
  })
})
