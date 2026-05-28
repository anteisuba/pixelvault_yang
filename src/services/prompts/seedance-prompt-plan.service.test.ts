import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const mockEnsureUser = vi.fn()
vi.mock('@/services/user.service', () => ({
  ensureUser: (...args: unknown[]) => mockEnsureUser(...args),
}))

const mockResolveNodePlannerRoute = vi.fn()
vi.mock('@/services/kernel/node-planner-route.service', () => ({
  resolveNodePlannerRoute: (...args: unknown[]) =>
    mockResolveNodePlannerRoute(...args),
}))

const mockLlmTextCompletion = vi.fn()
vi.mock('@/services/llm-text.service', () => ({
  llmTextCompletion: (...args: unknown[]) => mockLlmTextCompletion(...args),
}))

vi.mock('@/lib/with-retry', () => ({
  withRetry: (task: () => Promise<string>) => task(),
}))

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { createSeedancePromptPlan } from '@/services/prompts/seedance-prompt-plan.service'

const FAKE_USER = { id: 'db_user_1', clerkId: 'clerk_user_1' }

const FAKE_ROUTE = {
  adapterType: AI_ADAPTER_TYPES.GEMINI,
  providerConfig: {
    label: 'Personal Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
  },
  apiKey: 'gemini-key',
  modelId: 'gemini-3.5-flash',
  label: 'Personal Gemini',
}

const VALID_PLAN = {
  title: 'Rain Window Cat',
  visualDescription:
    'A fluffy orange tabby watches rain from a warm wooden windowsill.',
  timeline: [
    {
      startSecond: 0,
      endSecond: 4,
      action: 'The cat watches raindrops trace the glass.',
      camera: 'Medium close-up with a slow push-in.',
      composition: 'Cat profile against cool rainy city blur.',
    },
  ],
  motion: 'Subtle ear twitches, slow push-in, gentle rain movement.',
  camera: 'Cinematic close-up, shallow depth of field.',
  duration: '8s',
  audioIntent: 'Gentle rain on glass, distant soft thunder, no music.',
  finalPrompt:
    'A fluffy orange tabby cat sits on a wooden windowsill watching rain. 0-4s: medium close-up, slow push-in. Background audio: gentle rain on glass.',
  copyRisk: 'low',
}

describe('createSeedancePromptPlan', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockResolveNodePlannerRoute.mockResolvedValue(FAKE_ROUTE)
  })

  it('returns validated Seedance prompt plan data', async () => {
    mockLlmTextCompletion.mockResolvedValue(JSON.stringify(VALID_PLAN))

    const result = await createSeedancePromptPlan('clerk_user_1', {
      idea: 'A cat sitting on a windowsill watching rain',
      plannerProvider: 'auto',
      locale: 'en',
    })

    expect(result.plan.title).toBe(VALID_PLAN.title)
    expect(result.planner).toEqual({
      adapterType: AI_ADAPTER_TYPES.GEMINI,
      modelId: FAKE_ROUTE.modelId,
      label: FAKE_ROUTE.label,
    })
    expect(mockResolveNodePlannerRoute).toHaveBeenCalledWith(
      FAKE_USER.id,
      'auto',
      undefined,
    )
    expect(mockLlmTextCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        adapterType: AI_ADAPTER_TYPES.GEMINI,
        apiKey: FAKE_ROUTE.apiKey,
        modelId: FAKE_ROUTE.modelId,
        responseFormat: 'json_object',
      }),
    )
  })

  it('requests locale-matched Seedance prompt text for Chinese users', async () => {
    mockLlmTextCompletion.mockResolvedValue(JSON.stringify(VALID_PLAN))

    await createSeedancePromptPlan('clerk_user_1', {
      idea: '我想做一个拟人化 AI 工具在酒吧聊天的二次元短片',
      plannerProvider: 'auto',
      locale: 'zh',
    })

    expect(mockLlmTextCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        userPrompt: expect.stringContaining(
          'Write every JSON string value in Simplified Chinese',
        ),
      }),
    )
    expect(mockLlmTextCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        userPrompt: expect.not.stringContaining('Write finalPrompt in English'),
      }),
    )
  })

  it('wraps invalid planner output in a structured provider output error', async () => {
    mockLlmTextCompletion.mockResolvedValue(JSON.stringify({ title: '' }))

    await expect(
      createSeedancePromptPlan('clerk_user_1', {
        idea: 'invalid output',
        plannerProvider: 'gemini',
        locale: 'zh',
      }),
    ).rejects.toMatchObject({
      errorCode: 'SEEDANCE_PROMPT_PLAN_INVALID_OUTPUT',
      httpStatus: 502,
      i18nKey: 'errors.provider.invalidStructuredOutput',
    })
  })

  it('wraps malformed planner JSON in a structured provider output error', async () => {
    mockLlmTextCompletion.mockResolvedValue('{"title":"Broken"')

    await expect(
      createSeedancePromptPlan('clerk_user_1', {
        idea: 'malformed output',
        plannerProvider: 'gemini',
        locale: 'ja',
      }),
    ).rejects.toMatchObject({
      errorCode: 'SEEDANCE_PROMPT_PLAN_INVALID_OUTPUT',
      httpStatus: 502,
      i18nKey: 'errors.provider.invalidStructuredOutput',
    })
  })
})
