import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

const mockEnsureUser = vi.fn()
vi.mock('@/services/user.service', () => ({
  ensureUser: (...a: unknown[]) => mockEnsureUser(...a),
}))

/**
 * ⭐ 路由是**真的**（`resolveKeyOrAssistantRoute`），只桩库与补全那一跳（owner 2026-10-15
 * 「全跟助手」）。
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

import { getPromptFeedback } from '@/services/prompts/prompt-feedback.service'
import { LLM_TEXT_MODEL_IDS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  assistantKey,
  seedAssistantRoute,
} from '@/test/assistant-route-fixture'
import {
  expectSelectedProviderOnly,
  keyLookupUsesOf,
  providerUsesOf,
} from '@/test/selected-provider-only'

const FAKE_USER = { id: 'db_user_1', clerkId: 'clerk_1' }

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
    seedAssistantRoute(keyStore, {
      keys: [assistantKey(AI_ADAPTER_TYPES.GEMINI)],
    })
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

  it('⭐ 没点名 key = 助手那一家、那个型号（⛔ 不是顺序里排第一的 Gemini）', async () => {
    seedAssistantRoute(keyStore, {
      keys: [
        assistantKey(AI_ADAPTER_TYPES.GEMINI),
        assistantKey(AI_ADAPTER_TYPES.DEEPSEEK),
      ],
      routeModel: LLM_TEXT_MODEL_IDS.DEEPSEEK_V4_PRO,
    })
    mockLlmCompletion.mockResolvedValue(VALID_FEEDBACK_JSON)

    await getPromptFeedback('clerk_1', 'a cat under a tree')

    expect(mockLlmCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
        modelId: LLM_TEXT_MODEL_IDS.DEEPSEEK_V4_PRO,
      }),
    )
    expectSelectedProviderOnly(
      [
        ...keyLookupUsesOf(keyStore.findFirst),
        ...providerUsesOf(mockLlmCompletion, 'prompt feedback'),
      ],
      {
        adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
        apiKey: `plain:enc_${AI_ADAPTER_TYPES.DEEPSEEK}`,
      },
    )
  })
})
