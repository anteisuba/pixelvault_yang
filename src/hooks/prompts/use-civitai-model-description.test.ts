import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchCivitaiModelDescriptionAPI } from '@/lib/api-client/lora-assets'

import {
  __resetModelDescriptionCacheForTests,
  useCivitaiModelDescription,
  useCivitaiModelDetail,
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
    expect(mockAPI).toHaveBeenCalledWith(123, undefined)
  })

  it('surfaces the versions for the library detail page, fetched per rating tier', async () => {
    const version = { id: 'civitai:1:2', name: 'v2' }
    mockAPI.mockResolvedValue({
      success: true,
      data: {
        descriptionText: 'notes',
        versions: [version as never],
      },
    })

    const { result } = renderHook(() => useCivitaiModelDetail(1, 'safe'))

    await waitFor(() => expect(result.current.versions).toHaveLength(1))
    expect(result.current.descriptionText).toBe('notes')
    expect(mockAPI).toHaveBeenCalledWith(1, 'safe')

    // 同一个模型换一档分级另取一次（各版本封面随分级限定）。
    renderHook(() => useCivitaiModelDetail(1, 'unrestricted'))
    await waitFor(() => expect(mockAPI).toHaveBeenCalledWith(1, 'unrestricted'))
  })

  it('keeps descriptionText null on API failure (best-effort, no throw)', async () => {
    mockAPI.mockResolvedValue({ success: false, error: 'boom' })

    const { result } = renderHook(() => useCivitaiModelDescription(456))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.descriptionText).toBeNull()
  })
})
