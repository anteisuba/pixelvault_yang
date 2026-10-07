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
  hasNextPage = true,
): CivitaiLoraLibraryResult {
  return {
    items: [item],
    page,
    pageSize: 10,
    total: 1000,
    hasNextPage,
  }
}

describe('useCivitaiLoraLibrary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetCivitaiLibraryCacheForTests()
    // 分级偏好记在 localStorage 里，不能串到下一个用例。
    window.localStorage.clear()
  })

  afterEach(() => {
    __resetCivitaiLibraryCacheForTests()
  })

  it('does not search while typing — only on explicit submit', async () => {
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

    // 敲字只改输入框：列表原样留着，也不发请求。旧行为是防抖 300ms 后自动
    // 搜，等于每敲一个键打一次上游。
    expect(result.current.items).toEqual([firstPageItem])
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isRevalidating).toBe(false)
    expect(result.current.page).toBe(1)

    // 等足够久：没有提交就永远不该发第二次请求。
    await new Promise((resolve) => window.setTimeout(resolve, 400))
    expect(mockListCivitaiLoraAssetsAPI).toHaveBeenCalledTimes(1)

    act(() => {
      result.current.submitSearch()
    })

    await waitFor(() => expect(result.current.items).toEqual([searchItem]))

    expect(mockListCivitaiLoraAssetsAPI).toHaveBeenLastCalledWith(
      expect.objectContaining({
        page: 1,
        search: '鸣潮',
      }),
    )
    expect(result.current.isRevalidating).toBe(false)
  })

  it('clears the previous query while a submitted search is pending or fails', async () => {
    const oldItem = createItem('browse-1', '巅峰技艺 Apex Force')
    let resolveSearch!: (
      value: Awaited<ReturnType<typeof listCivitaiLoraAssetsAPI>>,
    ) => void
    mockListCivitaiLoraAssetsAPI
      .mockResolvedValueOnce({
        success: true,
        data: {
          ...createResult(oldItem, 1),
          total: 200,
        },
      })
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveSearch = resolve
        }),
      )

    const { result } = renderHook(() =>
      useCivitaiLoraLibrary({ initialSort: 'Newest' }),
    )
    await waitFor(() => expect(result.current.items).toEqual([oldItem]))
    act(() => result.current.setSearch('从零开始的'))
    act(() => result.current.submitSearch())

    expect(result.current.debouncedSearch).toBe('从零开始的')
    expect(result.current.sort).toBe('Highest Rated')
    expect(result.current.items).toEqual([])
    expect(result.current.selectedItem).toBeNull()
    expect(result.current.total).toBeNull()
    expect(result.current.hasNextPage).toBe(false)
    expect(result.current.isLoading).toBe(true)
    await waitFor(() =>
      expect(mockListCivitaiLoraAssetsAPI).toHaveBeenCalledTimes(2),
    )
    await act(async () =>
      resolveSearch({ success: false, error: 'Search unavailable' }),
    )
    expect(result.current.items).toEqual([])
    expect(result.current.error).toBe('Search unavailable')
    expect(result.current.isLoading).toBe(false)
  })

  it('does not apply a stale in-flight page after a new search is submitted', async () => {
    const browseItem = createItem('browse-1', 'Browse page 1')
    const searchItem = createItem('search-1', '鸣潮 Search LoRA')
    let resolveBrowse:
      | ((value: Awaited<ReturnType<typeof listCivitaiLoraAssetsAPI>>) => void)
      | undefined
    const browsePromise = new Promise<
      Awaited<ReturnType<typeof listCivitaiLoraAssetsAPI>>
    >((resolve) => {
      resolveBrowse = resolve
    })

    mockListCivitaiLoraAssetsAPI
      .mockReturnValueOnce(browsePromise)
      .mockResolvedValueOnce({
        success: true,
        data: createResult(searchItem, 1),
      })

    const { result } = renderHook(() => useCivitaiLoraLibrary())

    await waitFor(() =>
      expect(mockListCivitaiLoraAssetsAPI).toHaveBeenCalledTimes(1),
    )

    act(() => {
      result.current.setSearch('鸣潮')
      result.current.commitSearchTerm('鸣潮')
    })

    await waitFor(() => expect(result.current.items).toEqual([searchItem]))

    await act(async () => {
      resolveBrowse?.({
        success: true,
        data: createResult(browseItem, 1),
      })
    })

    expect(result.current.items).toEqual([searchItem])
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
      }),
    )
  })

  it('does not display previous results when a new search fails', async () => {
    const itemA = createItem('err-a', 'A')

    mockListCivitaiLoraAssetsAPI
      .mockResolvedValueOnce({ success: true, data: createResult(itemA, 1) })
      .mockResolvedValueOnce({ success: false, error: 'upstream blip' })

    const { result } = renderHook(() => useCivitaiLoraLibrary())
    await waitFor(() => expect(result.current.items).toEqual([itemA]))

    act(() => {
      result.current.setSearch('failing')
    })
    act(() => {
      result.current.submitSearch()
    })

    await waitFor(() => expect(result.current.error).toBe('upstream blip'))
    expect(result.current.items).toEqual([])
    expect(result.current.isRevalidating).toBe(false)
  })

  describe('page-number pagination', () => {
    it('advances to the next page by page number, with or without a search term', async () => {
      const page1Item = createItem('type-filter-1', 'Type filter page 1')
      const page2Item = createItem('type-filter-2', 'Type filter page 2')

      mockListCivitaiLoraAssetsAPI
        .mockResolvedValueOnce({
          success: true,
          data: {
            ...createResult(page1Item, 1),
          },
        })
        .mockResolvedValueOnce({
          success: true,
          data: {
            ...createResult(page2Item, 2, false),
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

    it('does not advance when the known total already fits on this page', async () => {
      const item = createItem('total-guard-1', 'Fits on page 1')

      mockListCivitaiLoraAssetsAPI.mockResolvedValueOnce({
        success: true,
        data: {
          ...createResult(item, 1),
          total: 5,
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
  })

  it('does not skip pages on rapid next clicks', async () => {
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
        data: createResult(firstPageItem, 1),
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
      expect.objectContaining({ page: 2 }),
    )

    act(() => {
      resolveSecondPage?.({
        success: true,
        data: createResult(secondPageItem, 2),
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

  // Loading-flicker regression:
  // the mount fetch is dispatched a macrotask after mount (via deferEffectTask),
  // so `isRevalidating` is still false on first paint. `isLoading` must NOT be
  // gated on `isRevalidating` alone — otherwise the pane falls through to the
  // empty state ("没有找到匹配的公开 LoRA" / type-empty-state) while the first
  // request is still in flight.
  describe('first-load loader (no empty-state flash)', () => {
    it('shows the loader on first paint, before the mount fetch is even dispatched', () => {
      // Never resolves — nothing may race the synchronous assertions below.
      mockListCivitaiLoraAssetsAPI.mockReturnValue(new Promise(() => {}))

      const { result, unmount } = renderHook(() =>
        useCivitaiLoraLibrary({ initialContentType: 'clothing' }),
      )

      // The deferred refresh has not fired yet: no request, isRevalidating
      // has not committed true...
      expect(mockListCivitaiLoraAssetsAPI).not.toHaveBeenCalled()
      expect(result.current.isRevalidating).toBe(false)
      expect(result.current.items).toHaveLength(0)
      // ...but we still render the loader rather than the empty state.
      expect(result.current.isLoading).toBe(true)

      // Cleanup cancels the pending deferEffectTask timer so the never-
      // resolving promise is never even requested.
      unmount()
    })

    it('keeps the loader up while the first request is in flight, then shows the empty state only once it resolves empty', async () => {
      let resolveFirst:
        | ((
            value: Awaited<ReturnType<typeof listCivitaiLoraAssetsAPI>>,
          ) => void)
        | undefined
      mockListCivitaiLoraAssetsAPI.mockReturnValueOnce(
        new Promise<Awaited<ReturnType<typeof listCivitaiLoraAssetsAPI>>>(
          (resolve) => {
            resolveFirst = resolve
          },
        ),
      )

      const { result } = renderHook(() => useCivitaiLoraLibrary())

      // Wait until the deferred mount fetch has actually been dispatched.
      await waitFor(() =>
        expect(mockListCivitaiLoraAssetsAPI).toHaveBeenCalledTimes(1),
      )

      // Request in flight + no items → loader, never the empty state.
      expect(result.current.items).toHaveLength(0)
      expect(result.current.isLoading).toBe(true)

      // Resolve with a genuinely empty result → now the empty state may show.
      act(() => {
        resolveFirst?.({
          success: true,
          data: {
            items: [],
            page: 1,
            pageSize: 10,
            total: 0,
            hasNextPage: false,
          },
        })
      })

      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.items).toHaveLength(0)
      expect(result.current.isRevalidating).toBe(false)
    })
  })

  it('remembers the rating choice in this browser and starts from it next time', async () => {
    mockListCivitaiLoraAssetsAPI.mockResolvedValue({
      success: true,
      data: createResult(createItem('rated-1', 'Rated'), 1, false),
    })

    const first = renderHook(() => useCivitaiLoraLibrary())
    await waitFor(() => expect(first.result.current.items).toHaveLength(1))
    act(() => {
      first.result.current.setNsfwFilter('unrestricted')
    })
    await waitFor(() =>
      expect(mockListCivitaiLoraAssetsAPI).toHaveBeenLastCalledWith(
        expect.objectContaining({ nsfwFilter: 'unrestricted' }),
      ),
    )
    first.unmount()

    const second = renderHook(() => useCivitaiLoraLibrary())
    await waitFor(() =>
      expect(second.result.current.nsfwFilter).toBe('unrestricted'),
    )
  })

  it('lets a deep link override the remembered rating for this visit', async () => {
    window.localStorage.setItem('pixelvault:lora-library-nsfw', 'unrestricted')
    mockListCivitaiLoraAssetsAPI.mockResolvedValue({
      success: true,
      data: createResult(createItem('deep-1', 'Deep'), 1, false),
    })

    const { result } = renderHook(() =>
      useCivitaiLoraLibrary({ initialNsfwFilter: 'nsfwOnly' }),
    )

    await waitFor(() => expect(result.current.items).toHaveLength(1))
    expect(result.current.nsfwFilter).toBe('nsfwOnly')
  })

  it('aborts the in-flight request when a new one supersedes it', async () => {
    const first = createItem('sort-1', 'First sort')
    const second = createItem('sort-2', 'Second sort')

    mockListCivitaiLoraAssetsAPI
      .mockResolvedValueOnce({ success: true, data: createResult(first, 1) })
      .mockImplementationOnce(
        () => new Promise(() => {}), // 挂住不返回，模拟慢上游
      )
      .mockResolvedValueOnce({ success: true, data: createResult(second, 1) })

    const { result } = renderHook(() => useCivitaiLoraLibrary())
    await waitFor(() => expect(result.current.items).toEqual([first]))

    act(() => {
      result.current.setSort('Most Downloaded')
    })
    await waitFor(() =>
      expect(mockListCivitaiLoraAssetsAPI).toHaveBeenCalledTimes(2),
    )
    const pending = mockListCivitaiLoraAssetsAPI.mock.calls[1][0]
    expect(pending.signal?.aborted).toBe(false)

    act(() => {
      result.current.setSort('Newest')
    })
    await waitFor(() =>
      expect(mockListCivitaiLoraAssetsAPI).toHaveBeenCalledTimes(3),
    )

    // 被取代的那一条真的断了，不是只丢弃结果。
    expect(pending.signal?.aborted).toBe(true)
    await waitFor(() => expect(result.current.items).toEqual([second]))
  })

  it('aborts the in-flight request on unmount', async () => {
    const first = createItem('unmount-1', 'Before unmount')
    mockListCivitaiLoraAssetsAPI.mockResolvedValue({
      success: true,
      data: createResult(first, 1),
    })

    const { result, unmount } = renderHook(() => useCivitaiLoraLibrary())
    await waitFor(() => expect(result.current.items).toEqual([first]))
    const call = mockListCivitaiLoraAssetsAPI.mock.calls[0][0]
    expect(call.signal?.aborted).toBe(false)

    unmount()
    expect(call.signal?.aborted).toBe(true)
  })
})

describe('useCivitaiLoraLibrary — accumulate（库 B 往下滚）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetCivitaiLibraryCacheForTests()
    window.localStorage.clear()
  })

  afterEach(() => {
    __resetCivitaiLibraryCacheForTests()
  })

  it('appends the next segment on loadMore and keeps the first one', async () => {
    const first = createItem('a', 'A')
    const second = createItem('b', 'B')
    mockListCivitaiLoraAssetsAPI
      .mockResolvedValueOnce({
        success: true,
        data: { ...createResult(first, 1), total: 30 },
      })
      .mockResolvedValueOnce({
        success: true,
        data: { ...createResult(second, 2, false), total: 30 },
      })

    const { result } = renderHook(() =>
      useCivitaiLoraLibrary({ accumulate: true, pageSize: 24 }),
    )
    await waitFor(() => expect(result.current.items).toEqual([first]))

    act(() => result.current.loadMore())
    expect(result.current.isLoadingMore).toBe(true)

    await waitFor(() => expect(result.current.items).toEqual([first, second]))
    expect(result.current.isLoadingMore).toBe(false)
    expect(result.current.hasNextPage).toBe(false)
    expect(mockListCivitaiLoraAssetsAPI).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2, pageSize: 24 }),
    )
  })

  it('keeps the old results on screen while a new search loads, then swaps them in one go', async () => {
    const oldItem = createItem('old', 'Old')
    const newItem = createItem('new', 'Roccia')
    let resolveSearch!: (
      value: Awaited<ReturnType<typeof listCivitaiLoraAssetsAPI>>,
    ) => void
    mockListCivitaiLoraAssetsAPI
      .mockResolvedValueOnce({
        success: true,
        data: { ...createResult(oldItem, 1), total: 30 },
      })
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveSearch = resolve
        }),
      )

    const { result } = renderHook(() =>
      useCivitaiLoraLibrary({ accumulate: true, pageSize: 24 }),
    )
    await waitFor(() => expect(result.current.items).toEqual([oldItem]))

    act(() => result.current.setSearch('roccia'))
    act(() => result.current.submitSearch())

    // ⛔ 清成白屏：旧的一批还在，标成「正在换」。
    expect(result.current.items).toEqual([oldItem])
    expect(result.current.isReplacing).toBe(true)
    expect(result.current.isLoading).toBe(false)

    await act(async () => {
      resolveSearch({
        success: true,
        data: { ...createResult(newItem, 1, false), total: 1 },
      })
    })

    await waitFor(() => expect(result.current.items).toEqual([newItem]))
    expect(result.current.isReplacing).toBe(false)
    expect(result.current.total).toBe(1)
  })
})
