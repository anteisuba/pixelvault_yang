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
}

interface UseGalleryOptions {
  initialGenerations?: GenerationRecord[]
  initialPage?: number
  initialHasMore?: boolean
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
}

const DEFAULT_FILTERS: GalleryFilters = {
  search: '',
  model: '',
  sort: 'newest',
  type: 'all',
  timeRange: 'all',
  liked: false,
  projectId: '',
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
  const [error, setError] = useState<string | null>(null)
  const [isFetching, setIsFetching] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [filters, setFiltersState] = useState<GalleryFilters>({
    ...DEFAULT_FILTERS,
    ...initialFilters,
  })
  const sentinelRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef(initialPage)
  const hasMoreRef = useRef(initialHasMore)
  const isFetchingRef = useRef(false)
  const filtersRef = useRef(filters)

  useEffect(() => {
    pageRef.current = page
  }, [page])

  useEffect(() => {
    hasMoreRef.current = hasMore
  }, [hasMore])

  useEffect(() => {
    filtersRef.current = filters
  }, [filters])

  const fetchPage = useCallback(
    async (targetPage: number, append: boolean) => {
      if (isFetchingRef.current) return
      isFetchingRef.current = true

      setIsFetching(true)

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
        }
        const response = await fetchGalleryImages(
          targetPage,
          limit,
          filterParams,
        )

        if (response.success && response.data) {
          startTransition(() => {
            if (append) {
              setGenerations((current) =>
                mergeGenerations(current, response.data?.generations ?? []),
              )
            } else {
              setGenerations(response.data?.generations ?? [])
            }
            setPage(response.data?.page ?? targetPage)
            setTotal(response.data?.total ?? 0)
            setHasMore(response.data?.hasMore ?? false)
            setError(null)
          })
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
      setIsFetching(false)
    },
    [limit, mine, startTransition, tErrors],
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
      // When the caller opts into keepPrevious, leave the existing list
      // and total in place — the next fetchPage() will replace them on
      // success. This avoids the empty-grid flash when the /assets
      // sidebar switches sections.
      if (!keepPreviousOnFilterChange) {
        setGenerations([])
        setTotal(0)
        setHasMore(false)
      }
      void fetchPage(1, false)
    },
    [fetchPage, keepPreviousOnFilterChange],
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

  const removeGeneration = useCallback((id: string) => {
    setGenerations((current) => current.filter((g) => g.id !== id))
    setTotal((prev) => Math.max(prev - 1, 0))
  }, [])

  const removeGenerations = useCallback((ids: Set<string>) => {
    setGenerations((current) => current.filter((g) => !ids.has(g.id)))
    setTotal((prev) => Math.max(prev - ids.size, 0))
  }, [])

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
  }
}
