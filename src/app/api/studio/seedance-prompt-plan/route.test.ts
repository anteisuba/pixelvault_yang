import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createPOST,
  mockAuthenticated,
  mockRateLimitAllowed,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('@/services/prompts/seedance-prompt-plan.service', () => ({
  createSeedancePromptPlan: vi.fn(),
}))

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { createSeedancePromptPlan } from '@/services/prompts/seedance-prompt-plan.service'
import type { SeedancePromptPlanResponseData } from '@/types/seedance-prompt-plan'

import { POST } from './route'

const PLAN_RESPONSE: SeedancePromptPlanResponseData = {
  plan: {
    title: 'Signal Rain',
    visualDescription: 'A lone antenna pulses in a rainy neon alley.',
    timeline: [
      {
        startSecond: 0,
        endSecond: 4,
        action: 'The antenna flickers while rain streaks down metal.',
        camera: 'Slow push-in from street level.',
      },
    ],
    motion: 'Rainfall, signal pulse, slow push-in.',
    camera: 'Low-angle cinematic push-in.',
    duration: '8s',
    audioIntent: 'Rain, low electric hum, no music.',
    finalPrompt:
      'A lone antenna pulses in a rainy neon alley. 0-4s: slow push-in from street level. Background audio: rain and low electric hum.',
    copyRisk: 'low',
  },
  planner: {
    adapterType: AI_ADAPTER_TYPES.GEMINI,
    modelId: 'gemini-3.5-flash',
    label: 'Gemini',
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRateLimitAllowed()
})

describe('POST /api/studio/seedance-prompt-plan', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()

    const response = await POST(
      createPOST('/api/studio/seedance-prompt-plan', {
        idea: 'rain signal',
        plannerProvider: 'auto',
        locale: 'en',
      }),
    )

    expect(response.status).toBe(401)
    const body = await parseJSON<{ success: boolean }>(response)
    expect(body.success).toBe(false)
  })

  it('returns 400 for invalid request body', async () => {
    mockAuthenticated()

    const response = await POST(
      createPOST('/api/studio/seedance-prompt-plan', {
        plannerProvider: 'auto',
        locale: 'en',
      }),
    )

    expect(response.status).toBe(400)
    const body = await parseJSON<{ success: boolean }>(response)
    expect(body.success).toBe(false)
  })

  it('returns Seedance prompt plan data on success', async () => {
    mockAuthenticated()
    vi.mocked(createSeedancePromptPlan).mockResolvedValue(PLAN_RESPONSE)

    const response = await POST(
      createPOST('/api/studio/seedance-prompt-plan', {
        idea: 'rain signal',
        plannerProvider: 'auto',
        locale: 'zh',
      }),
    )

    expect(response.status).toBe(200)
    const body = await parseJSON(response)
    expect(body).toEqual({ success: true, data: PLAN_RESPONSE })
    expect(createSeedancePromptPlan).toHaveBeenCalledWith('clerk_test_user', {
      idea: 'rain signal',
      plannerProvider: 'auto',
      locale: 'zh',
    })
  })

  it('returns 500 when the service throws an unhandled error', async () => {
    mockAuthenticated()
    vi.mocked(createSeedancePromptPlan).mockRejectedValue(
      new Error('LLM failed'),
    )

    const response = await POST(
      createPOST('/api/studio/seedance-prompt-plan', {
        idea: 'rain signal',
        plannerProvider: 'auto',
        locale: 'en',
      }),
    )

    expect(response.status).toBe(500)
    const body = await parseJSON<{ success: boolean; error: string }>(response)
    expect(body.success).toBe(false)
    expect(body.error).toBeTruthy()
  })
})
