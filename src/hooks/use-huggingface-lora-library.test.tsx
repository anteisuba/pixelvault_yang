import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { listHuggingFaceLoraAssetsAPI } from '@/lib/api-client/lora-assets'
import type { HuggingFaceLoraSearchItem } from '@/types'

import { useHuggingFaceLoraLibrary } from './use-huggingface-lora-library'

vi.mock('@/lib/api-client/lora-assets', () => ({
  listHuggingFaceLoraAssetsAPI: vi.fn(),
}))

const mockListHuggingFaceLoraAssetsAPI = vi.mocked(listHuggingFaceLoraAssetsAPI)

function makeItem(name: string): HuggingFaceLoraSearchItem {
  return {
    repoId: `example/${name}`,
    name,
    modelPageUrl: `https://huggingface.co/example/${name}`,
    revision: 'main',
    files: [
      {
        filename: `${name}.safetensors`,
        downloadUrl: `https://huggingface.co/example/${name}/resolve/main/${name}.safetensors`,
        sizeBytes: 100,
        baseModelFamily: 'anima-dit',
      },
    ],
    triggerWord: name,
    type: 'style',
    baseModelFamily: 'anima-dit',
    coverImageUrl: null,
    tags: ['lora'],
    downloads: 1,
    likes: 1,
    license: null,
    gated: false,
    private: false,
  }
}

function resultData(
  name: string,
  input: {
    page?: number
    hasNextPage?: boolean
    nextCursor?: string | null
  } = {},
) {
  return {
    success: true as const,
    data: {
      items: [makeItem(name)],
      total: null,
      page: input.page ?? 1,
      limit: 12,
      hasNextPage: input.hasNextPage ?? false,
      nextCursor: input.nextCursor ?? null,
    },
  }
}

describe('useHuggingFaceLoraLibrary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListHuggingFaceLoraAssetsAPI.mockResolvedValue(
      resultData('popular-image-lora'),
    )
  })

  it('loads all image-LoRA families by default and debounces search changes', async () => {
    const { result } = renderHook(() => useHuggingFaceLoraLibrary())

    await waitFor(() => {
      expect(result.current.items[0]?.name).toBe('popular-image-lora')
    })
    expect(mockListHuggingFaceLoraAssetsAPI).toHaveBeenCalledWith({
      search: undefined,
      baseModelFamily: 'all',
      sort: 'downloads',
      contentType: 'all',
      limit: undefined,
      page: 1,
      cursor: undefined,
    })

    mockListHuggingFaceLoraAssetsAPI.mockResolvedValueOnce(
      resultData('hoshino'),
    )
    act(() => {
      result.current.setSearch('hoshino')
    })

    await waitFor(() => {
      expect(result.current.items[0]?.name).toBe('hoshino')
    })
    expect(mockListHuggingFaceLoraAssetsAPI).toHaveBeenLastCalledWith({
      search: 'hoshino',
      baseModelFamily: 'all',
      sort: 'downloads',
      contentType: 'all',
      limit: undefined,
      page: 1,
      cursor: undefined,
    })
  })

  it('uses the returned Hub cursor for next-page navigation', async () => {
    mockListHuggingFaceLoraAssetsAPI
      .mockResolvedValueOnce(
        resultData('page-one', {
          hasNextPage: true,
          nextCursor: 'cursor-page-two',
        }),
      )
      .mockResolvedValueOnce(resultData('page-two', { page: 2 }))

    const { result } = renderHook(() => useHuggingFaceLoraLibrary())
    await waitFor(() => {
      expect(result.current.hasNextPage).toBe(true)
    })

    act(() => {
      result.current.nextPage()
    })

    await waitFor(() => {
      expect(result.current.page).toBe(2)
      expect(result.current.items[0]?.name).toBe('page-two')
    })
    expect(mockListHuggingFaceLoraAssetsAPI).toHaveBeenLastCalledWith({
      search: undefined,
      baseModelFamily: 'all',
      sort: 'downloads',
      contentType: 'all',
      limit: undefined,
      page: 2,
      cursor: 'cursor-page-two',
    })
  })

  it('resets pagination when the base-model family changes', async () => {
    const { result } = renderHook(() => useHuggingFaceLoraLibrary())
    await waitFor(() => {
      expect(result.current.items).toHaveLength(1)
    })

    act(() => {
      result.current.setBaseModelFamily('anima-dit')
    })

    await waitFor(() => {
      expect(mockListHuggingFaceLoraAssetsAPI).toHaveBeenLastCalledWith(
        expect.objectContaining({
          baseModelFamily: 'anima-dit',
          page: 1,
          cursor: undefined,
        }),
      )
    })
  })

  // S1 统一外壳：HF 排序控件——setSort 切换 sort 值并重置分页，与
  // setBaseModelFamily 同一套契约。
  it('resets pagination when the sort changes and forwards it to the API', async () => {
    const { result } = renderHook(() =>
      useHuggingFaceLoraLibrary({ initialSort: 'trendingScore' }),
    )
    await waitFor(() => {
      expect(result.current.items).toHaveLength(1)
    })
    expect(result.current.sort).toBe('trendingScore')

    act(() => {
      result.current.setSort('lastModified')
    })

    expect(result.current.sort).toBe('lastModified')
    await waitFor(() => {
      expect(mockListHuggingFaceLoraAssetsAPI).toHaveBeenLastCalledWith(
        expect.objectContaining({
          sort: 'lastModified',
          page: 1,
          cursor: undefined,
        }),
      )
    })
  })
})
