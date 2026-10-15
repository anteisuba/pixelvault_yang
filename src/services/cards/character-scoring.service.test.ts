import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

const mockEnsureUser = vi.fn()
vi.mock('@/services/user.service', () => ({
  ensureUser: (...a: unknown[]) => mockEnsureUser(...a),
}))

/**
 * ⭐ 路由是**真的**（`resolveAssistantRoute` + `resolveLlmTextRoute`），只桩库与补全那一跳
 * （owner 2026-10-15「全跟助手」）：评分此前走旧的自动兜底，不认助手选的型号。
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

vi.mock('@/services/storage/r2', () => ({
  fetchAsBuffer: vi.fn().mockResolvedValue({
    buffer: Buffer.from('fake'),
    mimeType: 'image/png',
  }),
}))

import { scoreConsistency } from '@/services/cards/character-scoring.service'
import { LLM_TEXT_MODEL_IDS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { AssistantModelCannotSeeError } from '@/lib/errors'
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
const IMAGE = 'data:image/png;base64,iVBORw0KGgo='

const VALID_SCORE_JSON = JSON.stringify({
  overallScore: 82,
  breakdown: { face: 85, hair: 80, outfit: 78, pose: 85, style: 82 },
  suggestions: ['Add more detail to the hair'],
})

describe('scoreConsistency', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    seedAssistantRoute(keyStore, {
      keys: [assistantKey(AI_ADAPTER_TYPES.GEMINI)],
    })
    mockLlmCompletion.mockResolvedValue(VALID_SCORE_JSON)
  })

  it('returns a parsed consistency score on happy path', async () => {
    const result = await scoreConsistency('clerk_1', IMAGE, IMAGE)

    expect(result.overallScore).toBe(82)
    expect(result.breakdown.face).toBe(85)
  })

  it('returns DEFAULT_SCORE when LLM response is not valid JSON', async () => {
    mockLlmCompletion.mockResolvedValue('Sorry, I cannot compare these images.')

    const result = await scoreConsistency('clerk_1', IMAGE, IMAGE)

    expect(result.overallScore).toBe(50)
    expect(result.suggestions[0]).toContain('Unable to parse')
  })

  it('⭐ 用助手那一家、那个型号打分（⛔ 不是顺序里排第一的 Gemini）', async () => {
    seedAssistantRoute(keyStore, {
      keys: [
        assistantKey(AI_ADAPTER_TYPES.GEMINI),
        assistantKey(AI_ADAPTER_TYPES.OPENAI),
      ],
      routeModel: LLM_TEXT_MODEL_IDS.OPENAI_GPT_6_ASTRA,
    })

    await scoreConsistency('clerk_1', IMAGE, IMAGE)

    expect(mockLlmCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        adapterType: AI_ADAPTER_TYPES.OPENAI,
        modelId: LLM_TEXT_MODEL_IDS.OPENAI_GPT_6_ASTRA,
      }),
    )
    expectSelectedProviderOnly(
      [
        ...keyLookupUsesOf(keyStore.findFirst),
        ...providerUsesOf(mockLlmCompletion, 'score'),
      ],
      {
        adapterType: AI_ADAPTER_TYPES.OPENAI,
        apiKey: `plain:enc_${AI_ADAPTER_TYPES.OPENAI}`,
      },
    )
  })

  it('⛔ 助手选的 DeepSeek V4 Pro 看不了图 → 照实抛，⛔ 不借能看图的 Gemini', async () => {
    seedAssistantRoute(keyStore, {
      keys: [
        assistantKey(AI_ADAPTER_TYPES.GEMINI),
        assistantKey(AI_ADAPTER_TYPES.DEEPSEEK),
      ],
      routeModel: LLM_TEXT_MODEL_IDS.DEEPSEEK_V4_PRO,
    })

    await expect(
      scoreConsistency('clerk_1', IMAGE, IMAGE),
    ).rejects.toBeInstanceOf(AssistantModelCannotSeeError)
    expect(mockLlmCompletion).not.toHaveBeenCalled()
  })
})
