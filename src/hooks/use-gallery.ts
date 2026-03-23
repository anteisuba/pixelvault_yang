'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type RefObject,
} from 'react'

import { PAGINATION } from '@/constants/config'
import { fetchGalleryImages } from '@/lib/api-client'
import type {
  GallerySortOption,
  GenerationRecord,
  OutputTypeFilter,
} from '@/types'

export interface GalleryFilters {
  search: string
  model: string
  sort: GallerySortOption
  type: OutputTypeFilter
}

interface UseGalleryOptions {
  initialGenerations?: GenerationRecord[]
  initialPage?: number
  initialHasMore?: boolean
  initialTotal?: number
  limit?: number
  /** When true, fetches current user's own generations (including private) */
  mine?: boolean
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
}

const DEFAULT_FILTERS: GalleryFilters = {
  search: '',
  model: '',
  sort: 'newest',
  type: 'all',
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
  limit = PAGINATION.DEFAULT_LIMIT,
  mine = false,
}: UseGalleryOptions = {}): UseGalleryReturn {
  const [generations, setGenerations] =
    useState<GenerationRecord[]>(initialGenerations)
  const [total, setTotal] = useState(initialTotal)
  const [page, setPage] = useState(initialPage)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [error, setError] = useState<string | null>(null)
  const [isFetching, setIsFetching] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [filters, setFiltersState] = useState<GalleryFilters>(DEFAULT_FILTERS)
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
    isFetchingRef.current = isFetching
  }, [isFetching])

  useEffect(() => {
    filtersRef.current = filters
  }, [filters])

  const fetchPage = useCallback(
    async (targetPage: number, append: boolean) => {
      if (isFetchingRef.current) return

      setIsFetching(true)

      try {
        const f = filtersRef.current
        const filterParams = {
          search: f.search || undefined,
          model: f.model || undefined,
          sort: f.sort,
          type: f.type || undefined,
          mine,
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
          setError(response.error ?? 'Failed to load gallery')
        }
      } catch (error) {
        setError(
          error instanceof Error ? error.message : 'Failed to load gallery',
        )
      }
      setIsFetching(false)
    },
    [limit, mine, startTransition],
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
      setGenerations([])
      setTotal(0)
      setHasMore(false)
      void fetchPage(1, false)
    },
    [fetchPage],
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
  }
}
