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

const mockGetSystemApiKey = vi.fn()
vi.mock('@/lib/platform-keys', () => ({
  getSystemApiKey: (...args: unknown[]) => mockGetSystemApiKey(...args),
}))

const mockLlmTextCompletion = vi.fn()
const mockResolveLlmTextRoute = vi.fn()
vi.mock('@/services/llm-text.service', () => ({
  llmTextCompletion: (...args: unknown[]) => mockLlmTextCompletion(...args),
  resolveLlmTextRoute: (...args: unknown[]) => mockResolveLlmTextRoute(...args),
}))

vi.mock('@/lib/with-retry', () => ({
  withRetry: (task: () => Promise<string>) => task(),
}))

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { SCRIPT_PLANNER_MODELS } from '@/constants/script-breakdown'
import { createScriptBreakdown } from '@/services/script-breakdown.service'

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
    mockGetSystemApiKey.mockReturnValue(null)
  })

  it('returns validated breakdown data from the selected planner route', async () => {
    mockLlmTextCompletion.mockResolvedValue(JSON.stringify(VALID_BREAKDOWN))

    const result = await createScriptBreakdown('clerk_user_1', {
      idea: 'A lantern archive mystery',
      plannerProvider: 'auto',
      locale: 'en',
    })

    expect(result.breakdown.title).toBe(VALID_BREAKDOWN.title)
    expect(result.planner).toEqual({
      adapterType: AI_ADAPTER_TYPES.GEMINI,
      modelId: SCRIPT_PLANNER_MODELS.gemini.modelId,
      label: FAKE_KEY_ROUTE.providerConfig.label,
    })
    expect(mockLlmTextCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        adapterType: AI_ADAPTER_TYPES.GEMINI,
        apiKey: FAKE_KEY_ROUTE.keyValue,
        modelId: SCRIPT_PLANNER_MODELS.gemini.modelId,
        responseFormat: 'json_object',
      }),
    )
  })

  it('rejects invalid planner output', async () => {
    mockLlmTextCompletion.mockResolvedValue(JSON.stringify({ title: '' }))

    await expect(
      createScriptBreakdown('clerk_user_1', {
        idea: 'invalid output',
        plannerProvider: 'gemini',
        locale: 'en',
      }),
    ).rejects.toThrow()
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

  it('throws missing API key when no planner route is available', async () => {
    mockFindActiveKeyForAdapter.mockResolvedValue(null)

    await expect(
      createScriptBreakdown('clerk_user_1', {
        idea: 'missing key',
        plannerProvider: 'auto',
        locale: 'ja',
      }),
    ).rejects.toMatchObject({ errorCode: 'MISSING_API_KEY' })
  })
})
