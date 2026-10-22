import { useEffect } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, renderHook, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import type { GalleryResponse, GenerationRecord } from '@/types'
import {
  clearGalleryCache,
  makeGalleryCacheKey,
  writeGalleryCache,
} from '@/lib/gallery-cache'
import { fetchGalleryImages } from '@/lib/api-client'

import { useGallery, type GalleryFilters } from './use-gallery'

vi.mock('@/lib/api-client', () => ({
  fetchGalleryImages: vi.fn(),
}))

const mockFetchGalleryImages = vi.mocked(fetchGalleryImages)

const DEFAULT_FILTERS: GalleryFilters = {
  search: '',
  models: [],
  sort: 'newest',
  types: [],
  timeRange: 'all',
  liked: false,
  published: false,
  projectId: '',
  provider: '',
}

const MESSAGES = {
  Errors: {},
}

function wrapper({ children }: React.PropsWithChildren) {
  return (
    <NextIntlClientProvider locale="en" messages={MESSAGES}>
      {children}
    </NextIntlClientProvider>
  )
}

function generation(id: string): GenerationRecord {
  return {
    id,
    createdAt: new Date('2026-02-10'),
    outputType: 'IMAGE',
    status: 'COMPLETED',
    url: `https://r2.example.com/${id}.png`,
    storageKey: `generations/image/${id}.png`,
    mimeType: 'image/png',
    width: 1024,
    height: 1024,
    prompt: `prompt ${id}`,
    model: 'sdxl',
    provider: 'huggingface',
    requestCount: 1,
    isPublic: true,
    isPromptPublic: true,
    likeCount: 0,
    isLiked: false,
  }
}

function response(
  generations: GenerationRecord[],
  page: number,
  hasMore = false,
): GalleryResponse {
  return {
    success: true,
    data: {
      generations,
      page,
      limit: 2,
      total: generations.length,
      hasMore,
      nextCursor: hasMore ? `cursor-${page}` : null,
    },
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('useGallery', () => {
  it('does not restore another account’s picker images', () => {
    mockFetchGalleryImages.mockReturnValue(new Promise(() => {}))
    writeGalleryCache(
      makeGalleryCacheKey(DEFAULT_FILTERS, true, 2, 'picker:a'),
      {
        generations: [generation('private-a')],
        total: 1,
        hasMore: false,
        nextCursor: null,
      },
    )
    const { result } = renderHook(
      () => useGallery({ mine: true, limit: 2, cacheScope: 'picker:b' }),
      { wrapper },
    )
    expect(result.current.generations).toEqual([])
    expect(result.current.hasLoaded).toBe(false)
  })

  it('reopening a picker immediately shows cached images and refreshes them in place', async () => {
    const pending = deferred<GalleryResponse>()
    mockFetchGalleryImages.mockReturnValue(pending.promise)
    writeGalleryCache(makeGalleryCacheKey(DEFAULT_FILTERS, true, 2), {
      generations: [generation('cached')],
      total: 1,
      hasMore: false,
      nextCursor: null,
    })
    const { result } = renderHook(() => useGallery({ mine: true, limit: 2 }), {
      wrapper,
    })
    expect(result.current.generations.map((item) => item.id)).toEqual([
      'cached',
    ])
    act(() => result.current.setFilters(DEFAULT_FILTERS))
    expect(result.current.generations.map((item) => item.id)).toEqual([
      'cached',
    ])
    expect(result.current.isLoading).toBe(false)
    await act(async () => pending.resolve(response([generation('new')], 1)))
    await waitFor(() =>
      expect(result.current.generations.map((item) => item.id)).toEqual([
        'new',
      ]),
    )
  })

  beforeEach(() => {
    vi.clearAllMocks()
    clearGalleryCache()
  })

  it('blocks duplicate loadMore calls while an append request is pending', async () => {
    const pending = deferred<GalleryResponse>()
    mockFetchGalleryImages.mockReturnValue(pending.promise)

    const { result } = renderHook(
      () =>
        useGallery({
          initialGenerations: [generation('gen-1')],
          initialPage: 1,
          initialHasMore: true,
          initialNextCursor: 'cursor-1',
          initialTotal: 2,
          initialFilters: DEFAULT_FILTERS,
          limit: 2,
        }),
      { wrapper },
    )

    act(() => {
      result.current.loadMore()
      result.current.loadMore()
    })

    expect(mockFetchGalleryImages).toHaveBeenCalledTimes(1)
    expect(mockFetchGalleryImages).toHaveBeenCalledWith(
      2,
      2,
      expect.objectContaining({ sort: 'newest' }),
      'cursor-1',
    )

    await act(async () => {
      pending.resolve(response([generation('gen-2')], 2))
      await pending.promise
    })
  })

  it('lets a filter replacement supersede a pending append response', async () => {
    const appendRequest = deferred<GalleryResponse>()
    const replacementRequest = deferred<GalleryResponse>()
    mockFetchGalleryImages.mockImplementation((_page, _limit, filters) =>
      filters?.search === 'cat'
        ? replacementRequest.promise
        : appendRequest.promise,
    )

    const { result } = renderHook(
      () =>
        useGallery({
          initialGenerations: [generation('gen-1')],
          initialPage: 1,
          initialHasMore: true,
          initialNextCursor: 'cursor-1',
          initialTotal: 2,
          initialFilters: DEFAULT_FILTERS,
          limit: 2,
        }),
      { wrapper },
    )

    act(() => {
      result.current.loadMore()
    })

    act(() => {
      result.current.setFilters({ ...DEFAULT_FILTERS, search: 'cat' })
    })

    expect(mockFetchGalleryImages).toHaveBeenCalledTimes(2)

    await act(async () => {
      appendRequest.resolve(response([generation('stale')], 2))
      await appendRequest.promise
    })

    expect(result.current.generations).toEqual([])

    await act(async () => {
      replacementRequest.resolve(response([generation('cat')], 1))
      await replacementRequest.promise
    })

    await waitFor(() => {
      expect(result.current.generations.map((item) => item.id)).toEqual(['cat'])
    })
  })

  // 助手里的素材弹层（10-22 bug「滑不下去」）：第二次打开先铺缓存的那一页、后台静默
  // 刷新；哨兵一挂上就在视口里（一页填不满弹层，没有滚动条），可翻页被正在刷新的
  // 那一发挡掉。刷新回来条数没变，观察器不重挂，就再也不翻页了。
  it('keeps paging after a silent refresh swallowed the first load-more', async () => {
    const observed: Element[] = []
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(private callback: IntersectionObserverCallback) {}
        observe(target: Element) {
          observed.push(target)
          // 和浏览器一样：挂上之后异步报一次当前位置（哨兵在视口里）。
          setTimeout(() =>
            this.callback(
              [{ isIntersecting: true, target } as IntersectionObserverEntry],
              this as unknown as IntersectionObserver,
            ),
          )
        }
        disconnect() {}
      },
    )
    writeGalleryCache(makeGalleryCacheKey(DEFAULT_FILTERS, true, 2), {
      generations: [generation('a'), generation('b')],
      total: 3,
      hasMore: true,
      nextCursor: 'cursor-1',
    })
    const refresh = deferred<GalleryResponse>()
    mockFetchGalleryImages.mockImplementation((page) =>
      page === 1
        ? refresh.promise
        : Promise.resolve(response([generation('c')], 2)),
    )
    function Picker() {
      const { generations, hasMore, sentinelRef, setFilters } = useGallery({
        mine: true,
        limit: 2,
      })
      // 和 AssetPickerBrowser 一样：挂载后按自己的筛选取一次（命中缓存 → 静默刷新）。
      useEffect(() => {
        setFilters(DEFAULT_FILTERS)
      }, [setFilters])
      return (
        <>
          <p data-testid="ids">
            {generations.map((item) => item.id).join(',')}
          </p>
          {hasMore ? <div ref={sentinelRef} /> : null}
        </>
      )
    }
    const { getByTestId } = render(<Picker />, { wrapper })

    // 第一次「看见哨兵」落在刷新途中，被挡掉。
    await waitFor(() => expect(observed.length).toBeGreaterThan(0))
    await act(async () => new Promise((resolve) => setTimeout(resolve)))
    expect(mockFetchGalleryImages).toHaveBeenCalledTimes(1)

    await act(async () => {
      refresh.resolve(response([generation('a'), generation('b')], 1, true))
      await refresh.promise
    })
    await waitFor(() => expect(getByTestId('ids').textContent).toBe('a,b,c'))
    vi.unstubAllGlobals()
  })

  it('merges loadMore results in order without duplicate ids', async () => {
    mockFetchGalleryImages.mockResolvedValue(
      response([generation('gen-2'), generation('gen-1')], 2),
    )

    const { result } = renderHook(
      () =>
        useGallery({
          initialGenerations: [generation('gen-1')],
          initialPage: 1,
          initialHasMore: true,
          initialNextCursor: 'cursor-1',
          initialTotal: 3,
          initialFilters: DEFAULT_FILTERS,
          limit: 2,
        }),
      { wrapper },
    )

    act(() => {
      result.current.loadMore()
    })

    await waitFor(() => {
      expect(result.current.generations.map((item) => item.id)).toEqual([
        'gen-1',
        'gen-2',
      ])
    })
  })
})
