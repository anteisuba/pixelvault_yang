'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { ARENA } from '@/constants/config'
import { getArenaHistoryAPI } from '@/lib/api-client'
import type { ArenaHistoryEntry } from '@/types'

interface UseArenaHistoryReturn {
  matches: ArenaHistoryEntry[]
  total: number
  isLoading: boolean
  hasMore: boolean
  error: string | null
  loadMore: () => void
}

export function useArenaHistory(): UseArenaHistoryReturn {
  const [matches, setMatches] = useState<ArenaHistoryEntry[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const pageRef = useRef(0)
  const isFetchingRef = useRef(false)

  const fetchPage = useCallback(async (page: number) => {
    if (isFetchingRef.current) return
    isFetchingRef.current = true
    setIsLoading(true)

    const result = await getArenaHistoryAPI(page, ARENA.HISTORY_PAGE_SIZE)

    if (result.success && result.data) {
      setMatches((prev) =>
        page === 1 ? result.data!.matches : [...prev, ...result.data!.matches],
      )
      setTotal(result.data.total)
      setHasMore(result.data.hasMore)
      setError(null)
      pageRef.current = page
    } else {
      setError(result.error ?? 'Failed to load history')
    }

    setIsLoading(false)
    isFetchingRef.current = false
  }, [])

  useEffect(() => {
    void fetchPage(1)
  }, [fetchPage])

  const loadMore = useCallback(() => {
    if (!isFetchingRef.current && hasMore) {
      void fetchPage(pageRef.current + 1)
    }
  }, [fetchPage, hasMore])

  return { matches, total, isLoading, hasMore, error, loadMore }
}
