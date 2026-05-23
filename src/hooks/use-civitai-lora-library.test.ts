import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { listCivitaiLoraAssetsAPI } from '@/lib/api-client/lora-assets'
import { useCivitaiLoraLibrary } from '@/hooks/use-civitai-lora-library'
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
  })

  it('resets stale pagination and rows immediately when search changes', async () => {
    const firstPageItem = createItem('browse-1', 'Browse page 1')
    const secondPageItem = createItem('browse-2', 'Browse page 2')
    const searchItem = createItem('search-1', '鸣潮 Search LoRA')

    mockListCivitaiLoraAssetsAPI
      .mockResolvedValueOnce({
        success: true,
        data: createResult(firstPageItem, 1),
      })
      .mockResolvedValueOnce({
        success: true,
        data: createResult(secondPageItem, 2),
      })
      .mockResolvedValueOnce({
        success: true,
        data: createResult(searchItem, 1),
      })

    const { result } = renderHook(() => useCivitaiLoraLibrary())

    await waitFor(() => expect(result.current.items).toEqual([firstPageItem]))

    act(() => {
      result.current.nextPage()
    })
    await waitFor(() => expect(result.current.items).toEqual([secondPageItem]))
    expect(result.current.page).toBe(2)

    act(() => {
      result.current.setSearch('鸣潮')
    })

    expect(result.current.page).toBe(1)
    expect(result.current.items).toEqual([])
    expect(result.current.selectedItem).toBeNull()
    expect(result.current.isLoading).toBe(true)

    await new Promise((resolve) => window.setTimeout(resolve, 150))
    expect(mockListCivitaiLoraAssetsAPI).toHaveBeenCalledTimes(2)

    await waitFor(() => expect(result.current.items).toEqual([searchItem]))

    expect(mockListCivitaiLoraAssetsAPI).toHaveBeenLastCalledWith(
      expect.objectContaining({
        page: 1,
        cursor: null,
        search: '鸣潮',
      }),
    )
  })
})
