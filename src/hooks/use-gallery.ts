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
import type { GenerationRecord } from '@/types'

interface UseGalleryOptions {
  initialGenerations?: GenerationRecord[]
  initialPage?: number
  initialHasMore?: boolean
  limit?: number
}

export interface UseGalleryReturn {
  generations: GenerationRecord[]
  isLoading: boolean
  hasMore: boolean
  error: string | null
  loadMore: () => void
  sentinelRef: RefObject<HTMLDivElement | null>
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
  limit = PAGINATION.DEFAULT_LIMIT,
}: UseGalleryOptions = {}): UseGalleryReturn {
  const [generations, setGenerations] =
    useState<GenerationRecord[]>(initialGenerations)
  const [page, setPage] = useState(initialPage)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [error, setError] = useState<string | null>(null)
  const [isFetching, setIsFetching] = useState(false)
  const [isPending, startTransition] = useTransition()
  const sentinelRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef(initialPage)
  const hasMoreRef = useRef(initialHasMore)
  const isFetchingRef = useRef(false)

  useEffect(() => {
    pageRef.current = page
  }, [page])

  useEffect(() => {
    hasMoreRef.current = hasMore
  }, [hasMore])

  useEffect(() => {
    isFetchingRef.current = isFetching
  }, [isFetching])

  const loadMorePage = useCallback(async () => {
    if (isFetchingRef.current || !hasMoreRef.current) {
      return
    }

    setIsFetching(true)

    try {
      const response = await fetchGalleryImages(pageRef.current + 1, limit)

      if (response.success && response.data) {
        startTransition(() => {
          setGenerations((current) =>
            mergeGenerations(current, response.data?.generations ?? []),
          )
          setPage(response.data?.page ?? pageRef.current)
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
  }, [limit, startTransition])

  const loadMore = useCallback(() => {
    void loadMorePage()
  }, [loadMorePage])

  useEffect(() => {
    const target = sentinelRef.current

    if (!target || !hasMore) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadMorePage()
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
  }, [hasMore, loadMorePage])

  return {
    generations,
    isLoading: isFetching || isPending,
    hasMore,
    error,
    loadMore,
    sentinelRef,
  }
}
