import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createPOST,
  mockAuthenticated,
  mockRateLimitAllowed,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('@/services/script-breakdown.service', () => ({
  createScriptBreakdown: vi.fn(),
}))

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { createScriptBreakdown } from '@/services/script-breakdown.service'
import type { ScriptBreakdownResponseData } from '@/types/script-breakdown'

import { POST } from './route'

const BREAKDOWN_RESPONSE: ScriptBreakdownResponseData = {
  breakdown: {
    title: 'Signal Garden',
    logline: 'A botanist finds a radio signal inside a night garden.',
    referenceIntent: 'Intimate botanical mystery with practical warm light.',
    copyRisk: 'low',
    characters: [],
    scenes: [],
    actions: [],
    beats: [],
    shots: [],
  },
  planner: {
    adapterType: AI_ADAPTER_TYPES.GEMINI,
    modelId: 'gemini-2.5-flash-lite',
    label: 'Gemini',
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRateLimitAllowed()
})

describe('POST /api/script-breakdown', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()

    const response = await POST(
      createPOST('/api/script-breakdown', {
        idea: 'night garden',
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
      createPOST('/api/script-breakdown', {
        plannerProvider: 'auto',
        locale: 'en',
      }),
    )

    expect(response.status).toBe(400)
    const body = await parseJSON<{ success: boolean }>(response)
    expect(body.success).toBe(false)
  })

  it('returns script breakdown data on success', async () => {
    mockAuthenticated()
    vi.mocked(createScriptBreakdown).mockResolvedValue(BREAKDOWN_RESPONSE)

    const response = await POST(
      createPOST('/api/script-breakdown', {
        idea: 'night garden',
        plannerProvider: 'auto',
        locale: 'zh',
      }),
    )

    expect(response.status).toBe(200)
    const body = await parseJSON(response)
    expect(body).toEqual({ success: true, data: BREAKDOWN_RESPONSE })
    expect(createScriptBreakdown).toHaveBeenCalledWith('clerk_test_user', {
      idea: 'night garden',
      plannerProvider: 'auto',
      locale: 'zh',
    })
  })

  it('returns 500 when the service throws an unhandled error', async () => {
    mockAuthenticated()
    vi.mocked(createScriptBreakdown).mockRejectedValue(new Error('LLM failed'))

    const response = await POST(
      createPOST('/api/script-breakdown', {
        idea: 'night garden',
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
