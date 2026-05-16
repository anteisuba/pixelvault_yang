'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type RefObject,
} from 'react'
import { useTranslations } from 'next-intl'

import { PAGINATION } from '@/constants/config'
import { fetchGalleryImages } from '@/lib/api-client'
import { getApiErrorMessage } from '@/lib/api-error-message'
import {
  makeGalleryCacheKey,
  readGalleryCache,
  writeGalleryCache,
} from '@/lib/gallery-cache'
import type {
  GallerySortOption,
  GalleryTimeRange,
  GenerationRecord,
  OutputTypeFilter,
} from '@/types'

export interface GalleryFilters {
  search: string
  model: string
  sort: GallerySortOption
  type: OutputTypeFilter
  timeRange: GalleryTimeRange
  liked: boolean
  /**
   * Optional project scope:
   * - ''      → all projects (default)
   * - 'none'  → only generations not assigned to any project
   * - <uuid>  → only generations belonging to that project
   */
  projectId: string
  /** Filter by Generation.provider (e.g. USER_UPLOAD_PROVIDER for local uploads). */
  provider?: string
}

interface UseGalleryOptions {
  initialGenerations?: GenerationRecord[]
  initialPage?: number
  initialHasMore?: boolean
  initialNextCursor?: string | null
  initialTotal?: number
  initialFilters?: Partial<GalleryFilters>
  limit?: number
  /** When true, fetches current user's own generations (including private) */
  mine?: boolean
  /**
   * When true, `setFilters` will keep the previous list / total visible
   * until the new fetch resolves, instead of clearing them to 0 / [].
   * Used by the /assets browser so switching the right-sidebar section
   * doesn't flash an empty grid.
   */
  keepPreviousOnFilterChange?: boolean
}

export interface UseGalleryReturn {
  generations: GenerationRecord[]
  total: number
  isLoading: boolean
  hasMore: boolean
  error: string | null
  filters: GalleryFilters
  setFilters: (filters: GalleryFilters) => void
  loadMore: () => void
  sentinelRef: RefObject<HTMLDivElement | null>
  /** Remove a generation from the local list (after successful deletion) */
  removeGeneration: (id: string) => void
  /** Remove multiple generations from the local list (after batch deletion) */
  removeGenerations: (ids: Set<string>) => void
  /** Patch a generation in place (after publish/like/etc) so the grid mirrors the new state without refetching. */
  updateGeneration: (id: string, patch: Partial<GenerationRecord>) => void
}

const DEFAULT_FILTERS: GalleryFilters = {
  search: '',
  model: '',
  sort: 'newest',
  type: 'all',
  timeRange: 'all',
  liked: false,
  projectId: '',
  provider: '',
}

function mergeGenerations(
  current: GenerationRecord[],
  next: GenerationRecord[],
): GenerationRecord[] {
  const knownIds = new Set(current.map((generation) => generation.id))
  const uniqueNext = next.filter((generation) => !knownIds.has(generation.id))

  return [...current, ...uniqueNext]
}

export function useGallery({
  initialGenerations = [],
  initialPage = PAGINATION.DEFAULT_PAGE,
  initialHasMore = false,
  initialNextCursor = null,
  initialTotal = 0,
  initialFilters,
  limit = PAGINATION.DEFAULT_LIMIT,
  mine = false,
  keepPreviousOnFilterChange = false,
}: UseGalleryOptions = {}): UseGalleryReturn {
  const tErrors = useTranslations('Errors')
  const [generations, setGenerations] =
    useState<GenerationRecord[]>(initialGenerations)
  const [total, setTotal] = useState(initialTotal)
  const [page, setPage] = useState(initialPage)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor)
  const [error, setError] = useState<string | null>(null)
  const [isFetching, setIsFetching] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [filters, setFiltersState] = useState<GalleryFilters>({
    ...DEFAULT_FILTERS,
    ...initialFilters,
  })
  const sentinelRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef(initialPage)
  const totalRef = useRef(initialTotal)
  const hasMoreRef = useRef(initialHasMore)
  const nextCursorRef = useRef(initialNextCursor)
  const isFetchingRef = useRef(false)
  const filtersRef = useRef(filters)
  // Seed the module-level gallery cache once with the SSR snapshot so
  // flipping away from the initial filter and back lands on a cache hit
  // instead of refetching the data the page already shipped with. Lazy
  // ref init pattern keeps this idempotent across renders without
  // tripping the react-hooks/refs rule (which forbids reading a ref's
  // `.current` during render unless it's the null-check init form).
  //
  // CRITICAL: only seed when we actually have data to keep. Seeding empty
  // pre-poisons the cache so the next setFilters() call hits an empty
  // snapshot and triggers a SILENT revalidate — silent fetches don't
  // update the visible list (line 216-220 of fetchPage), so the UI stays
  // stuck on "no assets" forever. This was the AssetSelectorDialog bug:
  // dialog callers mount with no SSR data, hit the empty seed, and never
  // see the data the silent fetch loads.
  const seedRef = useRef<boolean | null>(null)
  if (seedRef.current == null) {
    seedRef.current = true
    if (initialGenerations.length > 0 || initialTotal > 0) {
      const initial = { ...DEFAULT_FILTERS, ...initialFilters }
      writeGalleryCache(makeGalleryCacheKey(initial, mine, limit), {
        generations: initialGenerations,
        total: initialTotal,
        hasMore: initialHasMore,
        nextCursor: initialNextCursor,
      })
    }
  }

  useEffect(() => {
    pageRef.current = page
  }, [page])

  useEffect(() => {
    totalRef.current = total
  }, [total])

  useEffect(() => {
    hasMoreRef.current = hasMore
  }, [hasMore])

  useEffect(() => {
    nextCursorRef.current = nextCursor
  }, [nextCursor])

  useEffect(() => {
    filtersRef.current = filters
  }, [filters])

  const fetchPage = useCallback(
    /**
     * @param silent When true, the fetch runs entirely in the background:
     *               it doesn't toggle `isFetching` and doesn't replace the
     *               currently-visible list. The cache is still updated so
     *               the next switch back gets the latest data. Used for
     *               stale-while-revalidate after a cache hit.
     */
    async (
      targetPage: number,
      append: boolean,
      opts?: { silent?: boolean },
    ) => {
      if (isFetchingRef.current) return
      isFetchingRef.current = true

      if (!opts?.silent) setIsFetching(true)

      try {
        const f = filtersRef.current
        const filterParams = {
          search: f.search || undefined,
          model: f.model || undefined,
          sort: f.sort,
          type: f.type || undefined,
          timeRange: f.timeRange || undefined,
          liked: f.liked || undefined,
          mine,
          projectId: f.projectId || undefined,
          provider: f.provider || undefined,
        }
        const response = await fetchGalleryImages(
          targetPage,
          limit,
          filterParams,
          append ? nextCursorRef.current : null,
        )

        if (response.success && response.data) {
          const fresh = response.data.generations ?? []
          const freshTotal = response.data.total ?? totalRef.current
          const freshHasMore = response.data.hasMore ?? false
          const freshNextCursor = response.data.nextCursor ?? null

          // Only the first-page response represents the full cacheable
          // snapshot. Pagination (`append`) extends the visible list but
          // doesn't replace what the cache holds for instant switch-back.
          if (targetPage === 1) {
            writeGalleryCache(
              makeGalleryCacheKey(filtersRef.current, mine, limit),
              {
                generations: fresh,
                total: freshTotal,
                hasMore: freshHasMore,
                nextCursor: freshNextCursor,
              },
            )
          }

          if (opts?.silent) {
            // Silent revalidate: keep React state untouched so we don't
            // interrupt scrolling / load-more in progress. Cache is the
            // source of truth for the next visit.
            setError(null)
          } else {
            pageRef.current = response.data?.page ?? targetPage
            totalRef.current = freshTotal
            hasMoreRef.current = freshHasMore
            nextCursorRef.current = freshNextCursor
            startTransition(() => {
              if (append) {
                setGenerations((current) => mergeGenerations(current, fresh))
              } else {
                setGenerations(fresh)
              }
              setPage(response.data?.page ?? targetPage)
              setTotal(freshTotal)
              setHasMore(freshHasMore)
              setNextCursor(freshNextCursor)
              setError(null)
            })
          }
        } else {
          setError(
            getApiErrorMessage(tErrors, response, 'Failed to load gallery'),
          )
        }
      } catch (error) {
        setError(
          error instanceof Error ? error.message : 'Failed to load gallery',
        )
      }
      isFetchingRef.current = false
      if (!opts?.silent) setIsFetching(false)
    },
    // State setters are listed for React Compiler's
    // preserve-manual-memoization rule — they're stable references, so
    // including them is cosmetic for the runtime but lets the compiler
    // verify the manual memoization is correct.
    [
      limit,
      mine,
      startTransition,
      tErrors,
      setIsFetching,
      setError,
      setGenerations,
      setPage,
      setTotal,
      setHasMore,
      setNextCursor,
    ],
  )

  const loadMore = useCallback(() => {
    void fetchPage(pageRef.current + 1, true)
  }, [fetchPage])

  const setFilters = useCallback(
    (newFilters: GalleryFilters) => {
      setFiltersState(newFilters)
      filtersRef.current = newFilters
      pageRef.current = 1
      setPage(1)

      const key = makeGalleryCacheKey(newFilters, mine, limit)
      const cached = readGalleryCache(key)

      if (cached) {
        // Cache hit → render the cached snapshot instantly (Krea-style
        // 0ms switch) and revalidate silently in the background so the
        // next visit picks up any server-side changes.
        totalRef.current = cached.total
        hasMoreRef.current = cached.hasMore
        nextCursorRef.current = cached.nextCursor
        startTransition(() => {
          setGenerations(cached.generations)
          setTotal(cached.total)
          setHasMore(cached.hasMore)
          setNextCursor(cached.nextCursor)
          setError(null)
        })
        void fetchPage(1, false, { silent: true })
        return
      }

      // Cache miss → clear the list immediately so the grid shows its
      // skeleton placeholders while the real data lands. The previous
      // `keepPreviousOnFilterChange` short-circuit produced a confusing
      // "no feedback" state on uncached switches, so we honour the flag
      // only when there's something cached to keep in its place.
      if (!keepPreviousOnFilterChange) {
        setGenerations([])
        setTotal(0)
        setHasMore(false)
        setNextCursor(null)
        totalRef.current = 0
        hasMoreRef.current = false
        nextCursorRef.current = null
      }
      void fetchPage(1, false)
    },
    // State setters explicit for React Compiler — same rationale as
    // fetchPage above.
    [
      fetchPage,
      keepPreviousOnFilterChange,
      limit,
      mine,
      startTransition,
      setFiltersState,
      setPage,
      setGenerations,
      setTotal,
      setHasMore,
      setNextCursor,
      setError,
    ],
  )

  useEffect(() => {
    const target = sentinelRef.current

    if (!target || !hasMore) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void fetchPage(pageRef.current + 1, true)
        }
      },
      {
        rootMargin: '240px 0px',
      },
    )

    observer.observe(target)

    return () => {
      observer.disconnect()
    }
  }, [hasMore, fetchPage])

  const removeGeneration = useCallback(
    (id: string) => {
      setGenerations((current) => current.filter((g) => g.id !== id))
      setTotal((prev) => Math.max(prev - 1, 0))
    },
    [setGenerations, setTotal],
  )

  const removeGenerations = useCallback(
    (ids: Set<string>) => {
      setGenerations((current) => current.filter((g) => !ids.has(g.id)))
      setTotal((prev) => Math.max(prev - ids.size, 0))
    },
    [setGenerations, setTotal],
  )

  const updateGeneration = useCallback(
    (id: string, patch: Partial<GenerationRecord>) => {
      setGenerations((current) =>
        current.map((g) => (g.id === id ? { ...g, ...patch } : g)),
      )
    },
    [setGenerations],
  )

  return {
    generations,
    total,
    isLoading: isFetching || isPending,
    hasMore,
    error,
    filters,
    setFilters,
    loadMore,
    sentinelRef,
    removeGeneration,
    removeGenerations,
    updateGeneration,
  }
}
