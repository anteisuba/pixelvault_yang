import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

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

import { getPromptFeedback } from '@/services/prompt-feedback.service'
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

const VALID_FEEDBACK_JSON = JSON.stringify({
  overallAssessment: 'A solid prompt with good subject clarity.',
  suggestions: [
    {
      category: 'Lighting',
      suggestion: 'Specify the time of day.',
      example: 'golden hour lighting',
    },
  ],
  improvedPrompt: 'a cat sitting under a tree, golden hour lighting',
})

describe('getPromptFeedback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockResolveLlmRoute.mockResolvedValue(FAKE_ROUTE)
  })

  it('returns structured feedback on happy path', async () => {
    mockLlmCompletion.mockResolvedValue(VALID_FEEDBACK_JSON)

    const result = await getPromptFeedback('clerk_1', 'a cat under a tree')

    expect(result.overallAssessment).toContain('solid')
    expect(result.suggestions).toHaveLength(1)
    expect(result.improvedPrompt).toContain('golden hour')
    expect(result.originalPrompt).toBe('a cat under a tree')
  })

  it('returns fallback when LLM returns schema-invalid JSON', async () => {
    mockLlmCompletion.mockResolvedValue(
      JSON.stringify({ message: 'no schema' }),
    )

    const result = await getPromptFeedback('clerk_1', 'a cat under a tree')

    expect(result.improvedPrompt).toBe('a cat under a tree')
    expect(result.suggestions[0]?.category).toBe('General')
  })
})
