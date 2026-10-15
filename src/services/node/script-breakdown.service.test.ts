import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const mockEnsureUser = vi.fn()
vi.mock('@/services/user.service', () => ({
  ensureUser: (...args: unknown[]) => mockEnsureUser(...args),
}))

const mockFindActiveKeyForAdapter = vi.fn()
vi.mock('@/services/apiKey.service', () => ({
  findActiveKeyForAdapter: (...args: unknown[]) =>
    mockFindActiveKeyForAdapter(...args),
}))

/**
 * ⭐「自动」的路由是**真的**（`resolveAssistantRoute` + `resolveLlmTextRoute`），只桩库与补全
 * （owner 2026-10-15「全跟助手」）：「自动」此前按 Gemini → DeepSeek → OpenAI 自己挑一家。
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

const mockLlmTextCompletion = vi.fn()
vi.mock('@/services/llm-text.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/llm-text.service')>()),
  llmTextCompletion: (...args: unknown[]) => mockLlmTextCompletion(...args),
}))

vi.mock('@/lib/with-retry', () => ({
  withRetry: (task: () => Promise<string>) => task(),
}))

import { LLM_TEXT_MODEL_IDS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { SCRIPT_PLANNER_MODELS } from '@/constants/script-breakdown'
import { AssistantModelKeyMissingError } from '@/lib/errors'
import { createScriptBreakdown } from '@/services/node/script-breakdown.service'
import {
  assistantKey,
  seedAssistantRoute,
} from '@/test/assistant-route-fixture'
import {
  expectSelectedProviderOnly,
  keyLookupUsesOf,
  providerUsesOf,
} from '@/test/selected-provider-only'

const FAKE_USER = { id: 'db_user_1', clerkId: 'clerk_user_1' }

const FAKE_KEY_ROUTE = {
  adapterType: AI_ADAPTER_TYPES.GEMINI,
  providerConfig: {
    label: 'Personal Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
  },
  keyValue: 'gemini-key',
}

const VALID_BREAKDOWN = {
  title: 'Lantern Archive',
  logline: 'A curator follows a lantern into a sealed archive.',
  referenceIntent: 'Warm mystery tone with handcrafted archive textures.',
  copyRisk: 'low',
  characters: [
    {
      id: 'char-1',
      label: 'Curator',
      nameSuggestion: 'Ren',
      role: 'Lead',
      functionInStory: 'Opens the archive.',
      personality: 'Careful and curious.',
      visualSeed: 'young curator with linen coat and brass lantern',
      goal: 'Find the missing index.',
    },
  ],
  scenes: [
    {
      id: 'scene-1',
      label: 'Archive Door',
      summary: 'Ren unlocks the sealed archive.',
      location: 'Underground archive',
      timeOfDay: 'Night',
      mood: 'Suspenseful',
    },
  ],
  actions: [
    {
      id: 'action-1',
      sceneId: 'scene-1',
      label: 'Unlock',
      description: 'The brass key turns slowly in the door.',
    },
  ],
  beats: [
    {
      id: 'beat-1',
      sceneId: 'scene-1',
      label: 'Reveal',
      emotionalTurn: 'Anxiety shifts into wonder.',
      description: 'A shelf lights itself as the door opens.',
    },
  ],
  shots: [
    {
      id: 'shot-1',
      sceneId: 'scene-1',
      beatId: 'beat-1',
      label: 'Door detail',
      camera: 'Macro push-in',
      composition: 'Lantern reflection on engraved brass',
      promptSeed: 'brass archive lock reflecting warm lantern light',
    },
  ],
}

describe('createScriptBreakdown', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockFindActiveKeyForAdapter.mockResolvedValue(FAKE_KEY_ROUTE)
    seedAssistantRoute(keyStore, {
      keys: [assistantKey(AI_ADAPTER_TYPES.GEMINI)],
    })
  })

  it('「自动」= 助手那一家、那个型号（「自动」助手只有 Gemini key → Gemini 的默认档）', async () => {
    mockLlmTextCompletion.mockResolvedValue(JSON.stringify(VALID_BREAKDOWN))

    const result = await createScriptBreakdown('clerk_user_1', {
      idea: 'A lantern archive mystery',
      plannerProvider: 'auto',
      locale: 'en',
    })

    expect(result.breakdown.title).toBe(VALID_BREAKDOWN.title)
    expect(result.planner).toEqual({
      adapterType: AI_ADAPTER_TYPES.GEMINI,
      modelId: LLM_TEXT_MODEL_IDS.GEMINI_3_8_FLASH,
      label: 'Gemini 3.8 Flash',
    })
    expect(mockLlmTextCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        adapterType: AI_ADAPTER_TYPES.GEMINI,
        apiKey: `plain:enc_${AI_ADAPTER_TYPES.GEMINI}`,
        modelId: LLM_TEXT_MODEL_IDS.GEMINI_3_8_FLASH,
        responseFormat: 'json_object',
      }),
    )
  })

  it('⭐「自动」跟着助手选的 Claude 走（⛔ 不再按 Gemini → DeepSeek → OpenAI 自己挑一家）', async () => {
    seedAssistantRoute(keyStore, {
      keys: [
        assistantKey(AI_ADAPTER_TYPES.GEMINI),
        assistantKey(AI_ADAPTER_TYPES.ANTHROPIC),
      ],
      routeModel: LLM_TEXT_MODEL_IDS.CLAUDE_SONNET_5_5,
    })
    mockLlmTextCompletion.mockResolvedValue(JSON.stringify(VALID_BREAKDOWN))

    const result = await createScriptBreakdown('clerk_user_1', {
      idea: 'A lantern archive mystery',
      plannerProvider: 'auto',
      locale: 'en',
    })

    expect(result.planner).toEqual({
      adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
      modelId: LLM_TEXT_MODEL_IDS.CLAUDE_SONNET_5_5,
      label: 'Claude Sonnet 5.5',
    })
    expect(mockFindActiveKeyForAdapter).not.toHaveBeenCalled()
    expectSelectedProviderOnly(
      [
        ...keyLookupUsesOf(keyStore.findFirst),
        ...providerUsesOf(mockLlmTextCompletion, 'planner'),
      ],
      {
        adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
        apiKey: `plain:enc_${AI_ADAPTER_TYPES.ANTHROPIC}`,
      },
    )
  })

  it('⛔「自动」时助手选的那一家没 key → 照实抛，⛔ 不换有 key 的 Gemini', async () => {
    seedAssistantRoute(keyStore, {
      keys: [assistantKey(AI_ADAPTER_TYPES.GEMINI)],
      routeModel: LLM_TEXT_MODEL_IDS.CLAUDE_SONNET_5_5,
    })

    await expect(
      createScriptBreakdown('clerk_user_1', {
        idea: 'missing key',
        plannerProvider: 'auto',
        locale: 'en',
      }),
    ).rejects.toBeInstanceOf(AssistantModelKeyMissingError)
    expect(mockLlmTextCompletion).not.toHaveBeenCalled()
  })

  it('wraps invalid planner output in a structured provider output error', async () => {
    mockLlmTextCompletion.mockResolvedValue(JSON.stringify({ title: '' }))

    await expect(
      createScriptBreakdown('clerk_user_1', {
        idea: 'invalid output',
        plannerProvider: 'gemini',
        locale: 'en',
      }),
    ).rejects.toMatchObject({
      errorCode: 'SCRIPT_BREAKDOWN_INVALID_OUTPUT',
      httpStatus: 502,
      i18nKey: 'errors.provider.invalidStructuredOutput',
    })
  })

  it('wraps malformed planner JSON in a structured provider output error', async () => {
    mockLlmTextCompletion.mockResolvedValue(
      '{"title":"Broken","characters":[{"id":"char-1"}',
    )

    await expect(
      createScriptBreakdown('clerk_user_1', {
        idea: 'malformed output',
        plannerProvider: 'gemini',
        locale: 'zh',
      }),
    ).rejects.toMatchObject({
      errorCode: 'SCRIPT_BREAKDOWN_INVALID_OUTPUT',
      httpStatus: 502,
      i18nKey: 'errors.provider.invalidStructuredOutput',
    })
  })

  it('surfaces provider errors from the LLM adapter', async () => {
    mockLlmTextCompletion.mockRejectedValue(new Error('provider down'))

    await expect(
      createScriptBreakdown('clerk_user_1', {
        idea: 'provider error',
        plannerProvider: 'gemini',
        locale: 'zh',
      }),
    ).rejects.toThrow('provider down')
  })

  it('uses DeepSeek when explicitly selected as the planner route', async () => {
    mockFindActiveKeyForAdapter.mockImplementation(async (_userId, adapter) =>
      adapter === AI_ADAPTER_TYPES.DEEPSEEK
        ? {
            adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
            providerConfig: {
              label: 'Personal DeepSeek',
              baseUrl: 'https://api.deepseek.com',
            },
            keyValue: 'deepseek-key',
          }
        : null,
    )
    mockLlmTextCompletion.mockResolvedValue(JSON.stringify(VALID_BREAKDOWN))

    const result = await createScriptBreakdown('clerk_user_1', {
      idea: 'A lantern archive mystery',
      plannerProvider: 'deepseek',
      locale: 'zh',
    })

    expect(result.planner).toEqual({
      adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
      modelId: SCRIPT_PLANNER_MODELS.deepseek.modelId,
      label: 'Personal DeepSeek',
    })
    expect(mockLlmTextCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
        modelId: SCRIPT_PLANNER_MODELS.deepseek.modelId,
        responseFormat: 'json_object',
      }),
    )
  })

  it('throws missing API key when no planner route is available', async () => {
    mockFindActiveKeyForAdapter.mockResolvedValue(null)
    seedAssistantRoute(keyStore, { keys: [] })

    await expect(
      createScriptBreakdown('clerk_user_1', {
        idea: 'missing key',
        plannerProvider: 'auto',
        locale: 'ja',
      }),
    ).rejects.toMatchObject({ errorCode: 'MISSING_API_KEY' })
  })
})
