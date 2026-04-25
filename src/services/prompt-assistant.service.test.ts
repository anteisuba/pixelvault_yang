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
})
