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

vi.mock('next-intl', () => {
  const t = (key: string) => key

  return {
    useTranslations: () => t,
  }
})

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
    triggerAlternates: [],
    recommendedPrompt: null,
    recommendedPromptAlternates: [],
    triggerSource: 'official',
    fileHashAutoV3: null,
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
  nextCursor: string | null = `cursor-${page + 1}`,
): CivitaiLoraLibraryResult {
  return {
    items: [item],
    page,
    pageSize: 10,
    total: null,
    hasNextPage: nextCursor !== null,
    nextCursor,
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

  it("clears stale cards and requests the 'other' base-model bucket on category change", async () => {
    const allItem = createItem('all-1', 'All bucket result')
    const otherItem = createItem('other-1', 'Other bucket result')

    mockListCivitaiLoraAssetsAPI
      .mockResolvedValueOnce({
        success: true,
        data: createResult(allItem, 1),
      })
      .mockResolvedValueOnce({
        success: true,
        data: createResult(otherItem, 1),
      })

    const { result } = renderHook(() => useCivitaiLoraLibrary())
    await waitFor(() => expect(result.current.items).toEqual([allItem]))

    act(() => {
      result.current.setBaseModel('other')
    })

    expect(result.current.baseModel).toBe('other')
    expect(result.current.items).toEqual([])
    expect(result.current.selectedItem).toBeNull()
    expect(result.current.isLoading).toBe(true)

    await waitFor(() => expect(result.current.items).toEqual([otherItem]))
    expect(mockListCivitaiLoraAssetsAPI).toHaveBeenLastCalledWith(
      expect.objectContaining({
        baseModel: 'other',
        page: 1,
        cursor: null,
      }),
    )
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

  it('does not advance non-search pagination when the next cursor is missing', async () => {
    const item = createItem('page-1', 'Browse page 1')

    mockListCivitaiLoraAssetsAPI.mockResolvedValueOnce({
      success: true,
      data: {
        ...createResult(item, 1, null),
        hasNextPage: true,
      },
    })

    const { result } = renderHook(() => useCivitaiLoraLibrary())
    await waitFor(() => expect(result.current.items).toEqual([item]))

    act(() => {
      result.current.nextPage()
    })

    expect(result.current.page).toBe(1)
    expect(mockListCivitaiLoraAssetsAPI).toHaveBeenCalledTimes(1)
  })

  // Bug 修复（owner 报告：类型筛选下「下一页」不可点）：listCivitaiLoras
  // ByContentType 恒走 meilisearch 按页码 offset 分页、从不返回 nextCursor
  // ——纯浏览（无搜索词）时旧版 nextPage() 用「有没有搜索词」当「是否支持
  // 直接翻页」的代理判断，代理判断失真导致点击静默无效。服务端现在显式
  // 回传 offsetPaginationSupported，hook 应据此翻页，不再要求 cursor 就绪。
  describe('offset pagination without a cursor (Bug 2)', () => {
    it('advances to the next page when offsetPaginationSupported is true, even with no search term and no cursor', async () => {
      const page1Item = createItem('type-filter-1', 'Type filter page 1')
      const page2Item = createItem('type-filter-2', 'Type filter page 2')

      mockListCivitaiLoraAssetsAPI
        .mockResolvedValueOnce({
          success: true,
          data: {
            ...createResult(page1Item, 1, null),
            hasNextPage: true,
            offsetPaginationSupported: true,
          },
        })
        .mockResolvedValueOnce({
          success: true,
          data: {
            ...createResult(page2Item, 2, null),
            hasNextPage: false,
            offsetPaginationSupported: true,
          },
        })

      const { result } = renderHook(() =>
        useCivitaiLoraLibrary({ initialContentType: 'clothing' }),
      )
      await waitFor(() => expect(result.current.items).toEqual([page1Item]))

      act(() => {
        result.current.nextPage()
      })

      await waitFor(() => expect(result.current.items).toEqual([page2Item]))
      expect(result.current.page).toBe(2)
      expect(mockListCivitaiLoraAssetsAPI).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2, contentType: 'clothing' }),
      )
    })

    it('still refuses to advance without offsetPaginationSupported and without a cursor (unchanged REST-browse behaviour)', async () => {
      const item = createItem('rest-browse-1', 'REST browse page 1')

      mockListCivitaiLoraAssetsAPI.mockResolvedValueOnce({
        success: true,
        data: {
          ...createResult(item, 1, null),
          hasNextPage: true,
        },
      })

      const { result } = renderHook(() =>
        useCivitaiLoraLibrary({ initialContentType: 'clothing' }),
      )
      await waitFor(() => expect(result.current.items).toEqual([item]))

      act(() => {
        result.current.nextPage()
      })

      expect(result.current.page).toBe(1)
      expect(mockListCivitaiLoraAssetsAPI).toHaveBeenCalledTimes(1)
    })
  })

  it('does not skip cursor pages on rapid next clicks', async () => {
    const firstPageItem = createItem('page-1', 'Browse page 1')
    const secondPageItem = createItem('page-2', 'Browse page 2')
    let resolveSecondPage:
      | ((value: Awaited<ReturnType<typeof listCivitaiLoraAssetsAPI>>) => void)
      | undefined
    const secondPagePromise = new Promise<
      Awaited<ReturnType<typeof listCivitaiLoraAssetsAPI>>
    >((resolve) => {
      resolveSecondPage = resolve
    })

    mockListCivitaiLoraAssetsAPI
      .mockResolvedValueOnce({
        success: true,
        data: createResult(firstPageItem, 1, 'cursor-2'),
      })
      .mockReturnValueOnce(secondPagePromise)

    const { result } = renderHook(() => useCivitaiLoraLibrary())
    await waitFor(() => expect(result.current.items).toEqual([firstPageItem]))

    act(() => {
      result.current.nextPage()
      result.current.nextPage()
    })

    await waitFor(() =>
      expect(mockListCivitaiLoraAssetsAPI).toHaveBeenCalledTimes(2),
    )
    expect(result.current.page).toBe(2)
    expect(result.current.isRevalidating).toBe(true)
    expect(mockListCivitaiLoraAssetsAPI).toHaveBeenLastCalledWith(
      expect.objectContaining({
        page: 2,
        cursor: 'cursor-2',
      }),
    )

    act(() => {
      resolveSecondPage?.({
        success: true,
        data: createResult(secondPageItem, 2, 'cursor-3'),
      })
    })

    await waitFor(() => expect(result.current.items).toEqual([secondPageItem]))
    expect(result.current.page).toBe(2)
    expect(mockListCivitaiLoraAssetsAPI).toHaveBeenCalledTimes(2)
  })

  // P1-5：URL 深链的种子值——caller（CivitaiCommunityBranch）解析 URL 后
  // 传进来，hook 只在挂载时读一次。
  it('seeds baseModel/sort/search/nsfwFilter from options and fetches with them on mount', async () => {
    const item = createItem('deep-link', 'Deep link seed')
    mockListCivitaiLoraAssetsAPI.mockResolvedValueOnce({
      success: true,
      data: createResult(item, 1),
    })

    const { result } = renderHook(() =>
      useCivitaiLoraLibrary({
        initialBaseModel: 'Pony',
        initialSort: 'Newest',
        initialSearch: 'foo',
        initialNsfwFilter: 'nsfwOnly',
      }),
    )

    // Seeded search already equals debouncedSearch, so this fetches
    // immediately — no debounce wait needed.
    await waitFor(() => expect(result.current.items).toEqual([item]))

    expect(result.current.baseModel).toBe('Pony')
    expect(result.current.sort).toBe('Newest')
    expect(result.current.search).toBe('foo')
    expect(result.current.debouncedSearch).toBe('foo')
    expect(result.current.nsfwFilter).toBe('nsfwOnly')
    expect(mockListCivitaiLoraAssetsAPI).toHaveBeenCalledWith(
      expect.objectContaining({
        baseModel: 'Pony',
        sort: 'Newest',
        search: 'foo',
        nsfwFilter: 'nsfwOnly',
      }),
    )
  })

  it('defaults nsfwFilter to safe when no options are given', async () => {
    const item = createItem('default-nsfw', 'Default nsfw filter')
    mockListCivitaiLoraAssetsAPI.mockResolvedValueOnce({
      success: true,
      data: createResult(item, 1),
    })

    const { result } = renderHook(() => useCivitaiLoraLibrary())
    await waitFor(() => expect(result.current.items).toEqual([item]))

    expect(result.current.nsfwFilter).toBe('safe')
    expect(mockListCivitaiLoraAssetsAPI).toHaveBeenCalledWith(
      expect.objectContaining({ nsfwFilter: 'safe' }),
    )
  })

  // P1-6：nsfwFilter 是独立的缓存维度/请求参数——切换必须触发新请求，不能被
  // 另一档的缓存条目误命中，也不能悄悄透传成别的值。
  it('threads nsfwFilter into the fetch params and cache key, resetting to page 1 on toggle', async () => {
    const safeItem = createItem('safe-1', 'Safe result')
    const nsfwOnlyItem = createItem('nsfw-only-1', 'Nsfw only result')

    mockListCivitaiLoraAssetsAPI
      .mockResolvedValueOnce({
        success: true,
        data: createResult(safeItem, 1),
      })
      .mockResolvedValueOnce({
        success: true,
        data: createResult(nsfwOnlyItem, 1),
      })

    const { result } = renderHook(() => useCivitaiLoraLibrary())
    await waitFor(() => expect(result.current.items).toEqual([safeItem]))
    // 默认档现在是 safe，call #1 以 nsfwFilter=safe 为缓存键。
    expect(mockListCivitaiLoraAssetsAPI).toHaveBeenLastCalledWith(
      expect.objectContaining({ nsfwFilter: 'safe' }),
    )

    act(() => {
      result.current.setNsfwFilter('nsfwOnly')
    })

    expect(result.current.page).toBe(1)
    await waitFor(() => expect(result.current.items).toEqual([nsfwOnlyItem]))
    expect(mockListCivitaiLoraAssetsAPI).toHaveBeenCalledTimes(2)
    expect(mockListCivitaiLoraAssetsAPI).toHaveBeenLastCalledWith(
      expect.objectContaining({ nsfwFilter: 'nsfwOnly' }),
    )

    // Toggling back to the default (safe) hits the cache entry from the first
    // fetch (nsfwFilter is part of the cache key, so this is the same key
    // as call #1) — no third network call, same as the existing sort
    // toggle-back behaviour.
    act(() => {
      result.current.setNsfwFilter('safe')
    })
    await waitFor(() => expect(result.current.items).toEqual([safeItem]))
    expect(mockListCivitaiLoraAssetsAPI).toHaveBeenCalledTimes(2)
  })

  // Issue C (docs/plans/lora-search-image-audit-2026-07.md): once a search
  // session falls back to REST, every subsequent page in that same session
  // must keep requesting the REST backend explicitly — letting a later page
  // silently retry meilisearch (and maybe succeed) would put that page on a
  // different pagination paradigm (offset vs. cursor-scan) than the pages
  // around it, producing duplicate/misaligned pages.
  describe('search backend lock (Issue C)', () => {
    it('locks onto REST after a fallback and keeps sending source=rest on later pages', async () => {
      const page1Item = createItem('locked-1', 'Page 1')
      const page2Item = createItem('locked-2', 'Page 2')
      const page3Item = createItem('locked-3', 'Page 3')

      mockListCivitaiLoraAssetsAPI
        .mockResolvedValueOnce({
          success: true,
          data: {
            ...createResult(page1Item, 1, 'rest-cursor-2'),
            sortFellBackToRelevance: true,
          },
        })
        .mockResolvedValueOnce({
          success: true,
          data: {
            ...createResult(page2Item, 2, 'rest-cursor-3'),
            sortFellBackToRelevance: true,
          },
        })
        .mockResolvedValueOnce({
          success: true,
          data: {
            ...createResult(page3Item, 3, null),
            sortFellBackToRelevance: true,
          },
        })

      const { result } = renderHook(() =>
        useCivitaiLoraLibrary({ initialSearch: 'locked query' }),
      )

      await waitFor(() => expect(result.current.items).toEqual([page1Item]))
      // First page is unlocked — free choice, same as today.
      expect(mockListCivitaiLoraAssetsAPI).toHaveBeenLastCalledWith(
        expect.objectContaining({ source: undefined }),
      )

      act(() => {
        result.current.nextPage()
      })
      await waitFor(() => expect(result.current.items).toEqual([page2Item]))
      expect(mockListCivitaiLoraAssetsAPI).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2, source: 'rest' }),
      )

      act(() => {
        result.current.nextPage()
      })
      await waitFor(() => expect(result.current.items).toEqual([page3Item]))
      expect(mockListCivitaiLoraAssetsAPI).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 3, source: 'rest' }),
      )
    })

    it('never sends a source hint for browse-mode pagination (no search term)', async () => {
      const page1Item = createItem('browse-1', 'Browse 1')
      const page2Item = createItem('browse-2', 'Browse 2')

      mockListCivitaiLoraAssetsAPI
        .mockResolvedValueOnce({
          success: true,
          data: createResult(page1Item, 1, 'cursor-2'),
        })
        .mockResolvedValueOnce({
          success: true,
          data: createResult(page2Item, 2, null),
        })

      const { result } = renderHook(() => useCivitaiLoraLibrary())
      await waitFor(() => expect(result.current.items).toEqual([page1Item]))
      expect(mockListCivitaiLoraAssetsAPI).toHaveBeenLastCalledWith(
        expect.objectContaining({ source: undefined }),
      )

      act(() => {
        result.current.nextPage()
      })
      await waitFor(() => expect(result.current.items).toEqual([page2Item]))
      expect(mockListCivitaiLoraAssetsAPI).toHaveBeenLastCalledWith(
        expect.objectContaining({ source: undefined }),
      )
    })

    it('resets the backend lock when the search term changes (new session)', async () => {
      const firstQueryPage1 = createItem('reset-a-1', 'A page 1')
      const firstQueryPage2 = createItem('reset-a-2', 'A page 2')
      const secondQueryPage1 = createItem('reset-b-1', 'B page 1')

      mockListCivitaiLoraAssetsAPI
        .mockResolvedValueOnce({
          success: true,
          data: {
            ...createResult(firstQueryPage1, 1, 'rest-cursor-2'),
            sortFellBackToRelevance: true,
          },
        })
        .mockResolvedValueOnce({
          success: true,
          data: {
            ...createResult(firstQueryPage2, 2, null),
            sortFellBackToRelevance: true,
          },
        })
        .mockResolvedValueOnce({
          success: true,
          data: createResult(secondQueryPage1, 1),
        })

      const { result } = renderHook(() =>
        useCivitaiLoraLibrary({ initialSearch: 'first query' }),
      )
      await waitFor(() =>
        expect(result.current.items).toEqual([firstQueryPage1]),
      )

      act(() => {
        result.current.nextPage()
      })
      await waitFor(() =>
        expect(result.current.items).toEqual([firstQueryPage2]),
      )
      expect(mockListCivitaiLoraAssetsAPI).toHaveBeenLastCalledWith(
        expect.objectContaining({ source: 'rest' }),
      )

      act(() => {
        result.current.setSearch('second query')
      })
      await new Promise((resolve) => window.setTimeout(resolve, 350))
      await waitFor(() =>
        expect(result.current.items).toEqual([secondQueryPage1]),
      )

      // New session — must NOT carry over the previous session's REST lock.
      expect(mockListCivitaiLoraAssetsAPI).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, source: undefined }),
      )
    })
  })
})
