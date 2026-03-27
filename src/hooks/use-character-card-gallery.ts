'use client'

import { useState, useCallback, useEffect } from 'react'

import type { GenerationRecord } from '@/types'
import {
  getCharacterCardGenerationsAPI,
  getCharacterCombinationGenerationsAPI,
} from '@/lib/api-client'

export interface UseCharacterCardGalleryReturn {
  generations: GenerationRecord[]
  total: number
  hasMore: boolean
  isLoading: boolean
  error: string | null
  loadMore: () => Promise<void>
  refresh: () => Promise<void>
}

/**
 * Fetch generations linked to one or more character cards.
 * Single card → single-card endpoint. Multiple → combination endpoint (intersection).
 */
export function useCharacterCardGallery(
  cardIds: string[],
): UseCharacterCardGalleryReturn {
  const [generations, setGenerations] = useState<GenerationRecord[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cardKey = cardIds.slice().sort().join(',')

  const fetchPage = useCallback(
    async (pageNum: number, append: boolean) => {
      if (cardIds.length === 0) {
        setGenerations([])
        setTotal(0)
        setHasMore(false)
        return
      }

      setIsLoading(true)
      setError(null)

      const response =
        cardIds.length === 1
          ? await getCharacterCardGenerationsAPI(cardIds[0], pageNum)
          : await getCharacterCombinationGenerationsAPI(cardIds, pageNum)

      if (response.success && response.data) {
        setGenerations((prev) =>
          append
            ? [...prev, ...response.data!.generations]
            : response.data!.generations,
        )
        setTotal(response.data.total)
        setHasMore(response.data.hasMore)
      } else {
        setError(response.error ?? 'Failed to load generations')
      }
      setIsLoading(false)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cardKey],
  )

  // Reset when card selection changes
  useEffect(() => {
    setPage(1)
    setGenerations([])
    void fetchPage(1, false)
  }, [fetchPage])

  const loadMore = useCallback(async () => {
    if (isLoading || !hasMore) return
    const nextPage = page + 1
    setPage(nextPage)
    await fetchPage(nextPage, true)
  }, [isLoading, hasMore, page, fetchPage])

  const refresh = useCallback(async () => {
    setPage(1)
    await fetchPage(1, false)
  }, [fetchPage])

  return {
    generations,
    total,
    hasMore,
    isLoading,
    error,
    loadMore,
    refresh,
  }
}
