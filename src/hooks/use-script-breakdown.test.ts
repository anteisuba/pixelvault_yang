import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api-client/script-breakdown', () => ({
  createScriptBreakdownAPI: vi.fn(),
}))

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { createScriptBreakdownAPI } from '@/lib/api-client/script-breakdown'
import { useScriptBreakdown } from '@/hooks/use-script-breakdown'
import type { ScriptBreakdownResponseData } from '@/types/script-breakdown'

const BREAKDOWN_RESPONSE: ScriptBreakdownResponseData = {
  breakdown: {
    title: 'Glass Harbor',
    logline: 'A diver follows lights beneath a glassy harbor.',
    referenceIntent: 'Quiet coastal science fantasy.',
    copyRisk: 'low',
    characters: [],
    scenes: [],
    actions: [],
    beats: [],
    shots: [],
  },
  planner: {
    adapterType: AI_ADAPTER_TYPES.OPENAI,
    modelId: 'gpt-5.4-mini',
    label: 'OpenAI',
  },
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useScriptBreakdown', () => {
  it('returns generated breakdown data on success', async () => {
    vi.mocked(createScriptBreakdownAPI).mockResolvedValue({
      success: true,
      data: BREAKDOWN_RESPONSE,
    })

    const { result } = renderHook(() => useScriptBreakdown())
    let response: Awaited<ReturnType<typeof result.current.generate>>

    await act(async () => {
      response = await result.current.generate({
        idea: 'glass harbor',
        plannerProvider: 'auto',
        locale: 'en',
      })
    })

    expect(response!).toEqual({ success: true, data: BREAKDOWN_RESPONSE })
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('surfaces API errors and error codes', async () => {
    vi.mocked(createScriptBreakdownAPI).mockResolvedValue({
      success: false,
      error: 'Missing key',
      errorCode: 'MISSING_API_KEY',
    })

    const { result } = renderHook(() => useScriptBreakdown())

    await act(async () => {
      await result.current.generate({
        idea: 'glass harbor',
        plannerProvider: 'auto',
        locale: 'zh',
      })
    })

    expect(result.current.error).toBe('Missing key')
    expect(result.current.errorCode).toBe('MISSING_API_KEY')
  })

  it('returns a fallback message when the client throws', async () => {
    vi.mocked(createScriptBreakdownAPI).mockRejectedValue(new Error('offline'))

    const { result } = renderHook(() => useScriptBreakdown())
    let response: Awaited<ReturnType<typeof result.current.generate>>

    await act(async () => {
      response = await result.current.generate({
        idea: 'glass harbor',
        plannerProvider: 'auto',
        locale: 'ja',
      })
    })

    expect(response!).toEqual({ success: false, error: 'offline' })
    expect(result.current.error).toBe('offline')
    expect(result.current.errorCode).toBeNull()
  })

  it('resets stored error state', async () => {
    vi.mocked(createScriptBreakdownAPI).mockResolvedValue({
      success: false,
      error: 'Provider failed',
    })

    const { result } = renderHook(() => useScriptBreakdown())

    await act(async () => {
      await result.current.generate({
        idea: 'glass harbor',
        plannerProvider: 'auto',
        locale: 'en',
      })
    })

    act(() => {
      result.current.reset()
    })

    expect(result.current.error).toBeNull()
    expect(result.current.errorCode).toBeNull()
  })
})
