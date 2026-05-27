import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { listCivitaiLoraAssetsAPI } from '@/lib/api-client/lora-assets'
import {
  __resetCivitaiLibraryCacheForTests,
  useCivitaiLoraLibrary,
} from '@/hooks/use-civitai-lora-library'
import type { CivitaiLoraLibraryItem, CivitaiLoraLibraryResult } from '@/types'

vi.mock('@/lib/api-client/lora-assets', () => ({
  listCivitaiLoraAssetsAPI: vi.fn(),
}))

const mockListCivitaiLoraAssetsAPI = vi.mocked(listCivitaiLoraAssetsAPI)

function createItem(id: string, name: string): CivitaiLoraLibraryItem {
  return {
    id,
    styleCode: id,
    name,
    source: 'imported',
    type: 'style',
    baseModelFamily: 'SDXL 1.0',
    provider: 'civitai',
    triggerWord: name.toLowerCase(),
    loraUrl: `https://civitai.com/api/download/models/${id}`,
    coverImageUrl: null,
    coverImageUrlOriginal: null,
    thumbImageUrl: null,
    previewImageUrls: [],
    defaultScale: 1,
    isPublic: true,
    isOwn: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    modelId: 1,
    modelVersionId: 1,
    versionName: 'v1',
    creatorName: 'creator',
    creatorAvatarUrl: null,
    modelPageUrl: `https://civitai.com/models/${id}`,
    tags: [],
    downloadCount: 1,
    thumbsUpCount: 1,
    allowCommercialUse: [],
    allowDerivatives: false,
  }
}

function createResult(
  item: CivitaiLoraLibraryItem,
  page: number,
): CivitaiLoraLibraryResult {
  return {
    items: [item],
    page,
    pageSize: 10,
    total: null,
    hasNextPage: true,
    nextCursor: `cursor-${page + 1}`,
  }
}

describe('useCivitaiLoraLibrary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetCivitaiLibraryCacheForTests()
  })

  afterEach(() => {
    __resetCivitaiLibraryCacheForTests()
  })

  it('keeps previous items visible while a new search is debouncing and fetching', async () => {
    const firstPageItem = createItem('browse-1', 'Browse page 1')
    const searchItem = createItem('search-1', '鸣潮 Search LoRA')

    mockListCivitaiLoraAssetsAPI
      .mockResolvedValueOnce({
        success: true,
        data: createResult(firstPageItem, 1),
      })
      .mockResolvedValueOnce({
        success: true,
        data: createResult(searchItem, 1),
      })

    const { result } = renderHook(() => useCivitaiLoraLibrary())

    await waitFor(() => expect(result.current.items).toEqual([firstPageItem]))

    act(() => {
      result.current.setSearch('鸣潮')
    })

    // Stale items stay visible — no white flash. Revalidation flag flips on
    // immediately so the input can show a small spinner.
    expect(result.current.items).toEqual([firstPageItem])
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isRevalidating).toBe(true)
    expect(result.current.page).toBe(1)

    // Debounce window: API not called yet within the first 100 ms.
    await new Promise((resolve) => window.setTimeout(resolve, 100))
    expect(mockListCivitaiLoraAssetsAPI).toHaveBeenCalledTimes(1)

    await waitFor(() => expect(result.current.items).toEqual([searchItem]))

    expect(mockListCivitaiLoraAssetsAPI).toHaveBeenLastCalledWith(
      expect.objectContaining({
        page: 1,
        cursor: null,
        search: '鸣潮',
      }),
    )
    expect(result.current.isRevalidating).toBe(false)
  })

  it('serves repeated queries from cache without re-fetching', async () => {
    const itemA = createItem('cache-a', 'A')
    const itemB = createItem('cache-b', 'B')

    mockListCivitaiLoraAssetsAPI
      .mockResolvedValueOnce({ success: true, data: createResult(itemA, 1) })
      .mockResolvedValueOnce({ success: true, data: createResult(itemB, 1) })

    const { result } = renderHook(() => useCivitaiLoraLibrary())
    await waitFor(() => expect(result.current.items).toEqual([itemA]))

    // Switching sort → fresh fetch
    act(() => {
      result.current.setSort('Newest')
    })
    await waitFor(() => expect(result.current.items).toEqual([itemB]))
    expect(mockListCivitaiLoraAssetsAPI).toHaveBeenCalledTimes(2)

    // Switching back → cache hit, no extra fetch
    act(() => {
      result.current.setSort('Highest Rated')
    })
    await waitFor(() => expect(result.current.items).toEqual([itemA]))
    expect(mockListCivitaiLoraAssetsAPI).toHaveBeenCalledTimes(2)
    expect(result.current.isRevalidating).toBe(false)
  })

  it('keeps stale items visible when a fetch fails and surfaces error', async () => {
    const itemA = createItem('err-a', 'A')

    mockListCivitaiLoraAssetsAPI
      .mockResolvedValueOnce({ success: true, data: createResult(itemA, 1) })
      .mockResolvedValueOnce({ success: false, error: 'upstream blip' })

    const { result } = renderHook(() => useCivitaiLoraLibrary())
    await waitFor(() => expect(result.current.items).toEqual([itemA]))

    act(() => {
      result.current.setSearch('failing')
    })

    await waitFor(() => expect(result.current.error).toBe('upstream blip'))
    // Items not wiped — user can keep browsing what they already had.
    expect(result.current.items).toEqual([itemA])
    expect(result.current.isRevalidating).toBe(false)
  })
})
