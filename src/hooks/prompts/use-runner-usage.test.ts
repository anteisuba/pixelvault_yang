import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchRunnerUsageAPI } from '@/lib/api-client/lora-assets'

import { useRunnerUsage } from './use-runner-usage'

vi.mock('@/lib/api-client/lora-assets', () => ({
  fetchRunnerUsageAPI: vi.fn(),
}))

const mockAPI = vi.mocked(fetchRunnerUsageAPI)

describe('useRunnerUsage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('stays idle and fires no request when inactive', () => {
    const { result } = renderHook(() => useRunnerUsage(false))

    expect(result.current.usage).toBeNull()
    expect(result.current.isLoading).toBe(false)
    expect(mockAPI).not.toHaveBeenCalled()
  })

  it('fetches the usage snapshot when active (runner base selected)', async () => {
    mockAPI.mockResolvedValue({
      success: true,
      data: { enabled: true, used: 40, limit: 300, remaining: 260 },
    })

    const { result } = renderHook(() => useRunnerUsage(true))

    await waitFor(() => expect(result.current.usage?.remaining).toBe(260))
    expect(mockAPI).toHaveBeenCalledOnce()
  })

  it('keeps usage null on API failure (best-effort, hint just hides)', async () => {
    mockAPI.mockResolvedValue({ success: false, error: 'boom' })

    const { result } = renderHook(() => useRunnerUsage(true))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.usage).toBeNull()
  })
})
