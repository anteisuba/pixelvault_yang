import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchCivitaiModelDescriptionAPI } from '@/lib/api-client/lora-assets'

import {
  __resetModelDescriptionCacheForTests,
  useCivitaiModelDescription,
} from './use-civitai-model-description'

vi.mock('@/lib/api-client/lora-assets', () => ({
  fetchCivitaiModelDescriptionAPI: vi.fn(),
}))

const mockAPI = vi.mocked(fetchCivitaiModelDescriptionAPI)

describe('useCivitaiModelDescription', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetModelDescriptionCacheForTests()
  })

  it('stays idle and fires no request when modelId is null', () => {
    const { result } = renderHook(() => useCivitaiModelDescription(null))

    expect(result.current.descriptionText).toBeNull()
    expect(result.current.isLoading).toBe(false)
    expect(mockAPI).not.toHaveBeenCalled()
  })

  it('fetches and surfaces the description text for a modelId', async () => {
    mockAPI.mockResolvedValue({
      success: true,
      data: { descriptionText: 'author notes' },
    })

    const { result } = renderHook(() => useCivitaiModelDescription(123))

    await waitFor(() =>
      expect(result.current.descriptionText).toBe('author notes'),
    )
    expect(mockAPI).toHaveBeenCalledWith(123)
  })

  it('keeps descriptionText null on API failure (best-effort, no throw)', async () => {
    mockAPI.mockResolvedValue({ success: false, error: 'boom' })

    const { result } = renderHook(() => useCivitaiModelDescription(456))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.descriptionText).toBeNull()
  })
})
