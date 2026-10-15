import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mockEnsureUser = vi.fn()
vi.mock('@/services/user.service', () => ({
  ensureUser: (...a: unknown[]) => mockEnsureUser(...a),
}))

/**
 * ⭐ 路由是**真的**（`resolveKeyOrAssistantRoute`），只桩库与补全那一跳（owner 2026-10-15
 * 「全跟助手」）：没点名 key 时生成反馈此前走旧的自动兜底，不认助手选的型号。
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

import { LLM_TEXT_MODEL_IDS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { AssistantModelCannotSeeError } from '@/lib/errors'
import { conversationalRefine } from '@/services/generation-feedback.service'
import {
  assistantKey,
  seedAssistantRoute,
} from '@/test/assistant-route-fixture'
import {
  expectSelectedProviderOnly,
  keyLookupUsesOf,
  providerUsesOf,
} from '@/test/selected-provider-only'

const REPLY = JSON.stringify({
  reply: 'What would you like to change?',
  refinedPrompt: null,
  negativeAdditions: [],
  done: false,
})

describe('conversationalRefine', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue({ id: 'db_user_1' })
    mockLlmCompletion.mockResolvedValue(REPLY)
  })

  it('⭐ 没点名 key = 助手那一家、那个型号（⛔ 不是顺序里排第一的 Gemini）', async () => {
    seedAssistantRoute(keyStore, {
      keys: [
        assistantKey(AI_ADAPTER_TYPES.GEMINI),
        assistantKey(AI_ADAPTER_TYPES.XAI),
      ],
      routeModel: LLM_TEXT_MODEL_IDS.XAI_GROK_4_7,
    })

    const result = await conversationalRefine(
      'clerk_1',
      'https://cdn.example.com/a.png',
      'a cat',
      [],
      'en',
    )

    expect(result.reply).toBe('What would you like to change?')
    expect(mockLlmCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        adapterType: AI_ADAPTER_TYPES.XAI,
        modelId: LLM_TEXT_MODEL_IDS.XAI_GROK_4_7,
      }),
    )
    expectSelectedProviderOnly(
      [
        ...keyLookupUsesOf(keyStore.findFirst),
        ...providerUsesOf(mockLlmCompletion, 'generation feedback'),
      ],
      {
        adapterType: AI_ADAPTER_TYPES.XAI,
        apiKey: `plain:enc_${AI_ADAPTER_TYPES.XAI}`,
      },
    )
  })

  it('⛔ 助手选的 DeepSeek V4 Pro 看不了图 → 照实抛，⛔ 不借能看图的那一家', async () => {
    seedAssistantRoute(keyStore, {
      keys: [
        assistantKey(AI_ADAPTER_TYPES.GEMINI),
        assistantKey(AI_ADAPTER_TYPES.DEEPSEEK),
      ],
      routeModel: LLM_TEXT_MODEL_IDS.DEEPSEEK_V4_PRO,
    })

    await expect(
      conversationalRefine(
        'clerk_1',
        'https://cdn.example.com/a.png',
        'a cat',
        [],
        'en',
      ),
    ).rejects.toBeInstanceOf(AssistantModelCannotSeeError)
    expect(mockLlmCompletion).not.toHaveBeenCalled()
  })

  it('点名了一把 key：就用它（照旧）', async () => {
    seedAssistantRoute(keyStore, {
      keys: [
        assistantKey(AI_ADAPTER_TYPES.GEMINI),
        assistantKey(AI_ADAPTER_TYPES.OPENAI),
      ],
    })

    await conversationalRefine(
      'clerk_1',
      'https://cdn.example.com/a.png',
      'a cat',
      [],
      'en',
      `key_${AI_ADAPTER_TYPES.OPENAI}`,
    )

    expectSelectedProviderOnly(
      providerUsesOf(mockLlmCompletion, 'generation feedback'),
      { adapterType: AI_ADAPTER_TYPES.OPENAI },
    )
  })
})
