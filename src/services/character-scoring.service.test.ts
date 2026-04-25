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

vi.mock('@/services/storage/r2', () => ({
  fetchAsBuffer: vi.fn().mockResolvedValue({
    buffer: Buffer.from('fake'),
    mimeType: 'image/png',
  }),
}))

import { scoreConsistency } from '@/services/character-scoring.service'
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

const VALID_SCORE_JSON = JSON.stringify({
  overallScore: 82,
  breakdown: { face: 85, hair: 80, outfit: 78, pose: 85, style: 82 },
  suggestions: ['Add more detail to the hair'],
})

describe('scoreConsistency', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockResolveLlmRoute.mockResolvedValue(FAKE_ROUTE)
    mockLlmCompletion.mockResolvedValue(VALID_SCORE_JSON)
  })

  it('returns a parsed consistency score on happy path', async () => {
    const result = await scoreConsistency(
      'clerk_1',
      'data:image/png;base64,iVBORw0KGgo=',
      'data:image/png;base64,iVBORw0KGgo=',
    )

    expect(result.overallScore).toBe(82)
    expect(result.breakdown.face).toBe(85)
  })

  it('returns DEFAULT_SCORE when LLM response is not valid JSON', async () => {
    mockLlmCompletion.mockResolvedValue('Sorry, I cannot compare these images.')

    const result = await scoreConsistency(
      'clerk_1',
      'data:image/png;base64,iVBORw0KGgo=',
      'data:image/png;base64,iVBORw0KGgo=',
    )

    expect(result.overallScore).toBe(50)
    expect(result.suggestions[0]).toContain('Unable to parse')
  })
})
