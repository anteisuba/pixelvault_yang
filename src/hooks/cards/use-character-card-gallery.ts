'use client'

import { useState, useCallback, useEffect } from 'react'
import { useTranslations } from 'next-intl'

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
  const t = useTranslations('CharacterCard')
  const [generations, setGenerations] = useState<GenerationRecord[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cardKey = cardIds.slice().sort().join(',')

  const fetchPage = useCallback(
    async (pageNum: number, append: boolean, cursor?: string | null) => {
      if (cardIds.length === 0) {
        setGenerations([])
        setTotal(0)
        setHasMore(false)
        setNextCursor(null)
        return
      }

      setIsLoading(true)
      setError(null)

      const response =
        cardIds.length === 1
          ? await getCharacterCardGenerationsAPI(
              cardIds[0],
              pageNum,
              20,
              cursor,
            )
          : await getCharacterCombinationGenerationsAPI(
              cardIds,
              pageNum,
              20,
              cursor,
            )

      if (response.success && response.data) {
        setGenerations((prev) =>
          append
            ? [...prev, ...response.data!.generations]
            : response.data!.generations,
        )
        if (response.data.total != null) {
          setTotal(response.data.total)
        }
        setHasMore(response.data.hasMore)
        setNextCursor(response.data.nextCursor)
      } else {
        setError(response.error ?? t('gallery.loadFailed'))
      }
      setIsLoading(false)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cardKey, t],
  )

  // Reset when card selection changes
  useEffect(() => {
    setPage(1)
    setGenerations([])
    setNextCursor(null)
    void fetchPage(1, false)
  }, [fetchPage])

  const loadMore = useCallback(async () => {
    if (isLoading || !hasMore || !nextCursor) return
    const nextPage = page + 1
    setPage(nextPage)
    await fetchPage(nextPage, true, nextCursor)
  }, [isLoading, hasMore, nextCursor, page, fetchPage])

  const refresh = useCallback(async () => {
    setPage(1)
    setNextCursor(null)
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
