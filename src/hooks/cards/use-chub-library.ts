'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

import type { ChubLibrarySort } from '@/constants/cards/chub-library'
import type { ChubCardSummary } from '@/types/chub-library'
import { searchChubCardsAPI } from '@/lib/api-client'
import { getApiErrorMessage } from '@/lib/api-error-message'
import { deferEffectTask } from '@/lib/defer-effect-task'

/** 打字停多久才搜（ms）。 */
const SEARCH_DEBOUNCE_MS = 350

export type ChubLibraryStatus = 'loading' | 'ready' | 'error'

export interface UseChubLibraryReturn {
  query: string
  setQuery: (query: string) => void
  sort: ChubLibrarySort
  setSort: (sort: ChubLibrarySort) => void
  items: readonly ChubCardSummary[]
  /** 第一页的状态（换词 / 换排序重来）。 */
  status: ChubLibraryStatus
  /** 往下接一页的状态：`null` = 没在接。 */
  moreStatus: 'loading' | 'error' | null
  hasMore: boolean
  error: string | null
  loadMore: () => void
  retry: () => void
}

/**
 * 角色页「卡库」页签：搜 chub.ai 的酒馆卡。`enabled` 关着时不发请求（页签没打开就
 * 不碰 chub）；换词 / 换排序从第一页重来，旧请求作废。
 */
export function useChubLibrary(enabled: boolean): UseChubLibraryReturn {
  const tErrors = useTranslations('Errors')
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [sort, setSort] = useState<ChubLibrarySort>('popular')
  const [items, setItems] = useState<ChubCardSummary[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [status, setStatus] = useState<ChubLibraryStatus>('loading')
  const [moreStatus, setMoreStatus] = useState<'loading' | 'error' | null>(
    null,
  )
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const controller = useRef<AbortController | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedQuery(query.trim()),
      SEARCH_DEBOUNCE_MS,
    )
    return () => window.clearTimeout(timer)
  }, [query])

  const fetchPage = useCallback(
    async (q: string, nextSort: ChubLibrarySort, nextPage: number) => {
      controller.current?.abort()
      const abort = new AbortController()
      controller.current = abort
      const response = await searchChubCardsAPI(
        { q, sort: nextSort, page: nextPage },
        abort.signal,
      )
      if (abort.signal.aborted) return null
      if (response.success && response.data) return response.data
      setError(
        getApiErrorMessage(
          tErrors,
          response,
          tErrors('chubLibrary.unavailable'),
        ),
      )
      return null
    },
    [tErrors],
  )

  useEffect(() => {
    if (!enabled) return
    let live = true
    const cancel = deferEffectTask(() => {
      setStatus('loading')
      setMoreStatus(null)
      setError(null)
      void fetchPage(debouncedQuery, sort, 1).then((result) => {
        if (!live) return
        if (!result) {
          setStatus('error')
          return
        }
        setItems(result.items)
        setPage(1)
        setHasMore(result.hasMore)
        setStatus('ready')
      })
    })
    return () => {
      live = false
      cancel()
    }
  }, [attempt, debouncedQuery, enabled, fetchPage, sort])

  useEffect(() => () => controller.current?.abort(), [])

  const loadMore = useCallback(() => {
    if (status !== 'ready' || moreStatus === 'loading' || !hasMore) return
    setMoreStatus('loading')
    void fetchPage(debouncedQuery, sort, page + 1).then((result) => {
      if (!result) {
        setMoreStatus('error')
        return
      }
      setItems((prev) => {
        const seen = new Set(prev.map((item) => item.fullPath))
        return [...prev, ...result.items.filter((i) => !seen.has(i.fullPath))]
      })
      setPage(result.page)
      setHasMore(result.hasMore)
      setMoreStatus(null)
    })
  }, [debouncedQuery, fetchPage, hasMore, moreStatus, page, sort, status])

  const retry = useCallback(() => {
    if (moreStatus === 'error') {
      loadMore()
      return
    }
    setAttempt((value) => value + 1)
  }, [loadMore, moreStatus])

  return {
    query,
    setQuery,
    sort,
    setSort,
    items,
    status,
    moreStatus,
    hasMore,
    error,
    loadMore,
    retry,
  }
}
