import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import type { GalleryResponse, GenerationRecord } from '@/types'
import { clearGalleryCache } from '@/lib/gallery-cache'
import { fetchGalleryImages } from '@/lib/api-client'

import { useGallery, type GalleryFilters } from './use-gallery'

vi.mock('@/lib/api-client', () => ({
  fetchGalleryImages: vi.fn(),
}))

const mockFetchGalleryImages = vi.mocked(fetchGalleryImages)

const DEFAULT_FILTERS: GalleryFilters = {
  search: '',
  model: '',
  sort: 'newest',
  type: 'all',
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
