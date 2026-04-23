'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@clerk/nextjs'

import { fetchUsageSummary } from '@/lib/api-client'
import { deferToIdle } from '@/lib/defer-to-idle'
import { FREE_TIER } from '@/constants/config'
import type { UsageSummary } from '@/types'

interface UseUsageSummaryReturn {
  summary: UsageSummary
  isLoading: boolean
  /** Re-fetch usage data (call after generation completes) */
  refresh: () => void
}

const EMPTY_USAGE_SUMMARY: UsageSummary = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  last30DaysRequests: 0,
  lastRequestAt: null,
  freeGenerationsToday: 0,
  freeGenerationLimit: FREE_TIER.DAILY_LIMIT,
}

// 30-second in-memory cache — avoids re-fetching on every page navigation
const CACHE_TTL_MS = 30_000

interface UsageSummaryCache {
  userId: string
  data: UsageSummary
  fetchedAt: number
}

let _cache: UsageSummaryCache | null = null
let _inFlight: { userId: string; request: Promise<UsageSummary> } | null = null

function getFreshCache(userId: string): UsageSummary | null {
  if (!_cache || _cache.userId !== userId) return null
  if (Date.now() - _cache.fetchedAt >= CACHE_TTL_MS) return null
  return _cache.data
}

async function loadUsageSummary(
  userId: string,
  force: boolean,
): Promise<UsageSummary> {
  if (!force) {
    const cached = getFreshCache(userId)
    if (cached) return cached
    if (_inFlight?.userId === userId) return _inFlight.request
  }

  const request = fetchUsageSummary()
    .then((data) => {
      _cache = { userId, data, fetchedAt: Date.now() }
      return data
    })
    .finally(() => {
      if (_inFlight?.request === request) {
        _inFlight = null
      }
    })

  _inFlight = { userId, request }
  return request
}

export function useUsageSummary(): UseUsageSummaryReturn {
  const { isSignedIn, userId } = useAuth()
  const [summary, setSummary] = useState<UsageSummary>(
    () => (userId ? getFreshCache(userId) : null) ?? EMPTY_USAGE_SUMMARY,
  )
  const [isLoading, setIsLoading] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const isRefreshRef = useRef(false)

  const refresh = useCallback(() => {
    isRefreshRef.current = true
    setRefreshKey((k) => k + 1)
  }, [])

  useEffect(() => {
    let isCancelled = false

    async function loadSummary() {
      if (!isSignedIn || !userId) {
        if (!isCancelled) {
          _cache = null
          _inFlight = null
          setSummary(EMPTY_USAGE_SUMMARY)
          setIsLoading(false)
        }
        return
      }

      const isForced = isRefreshRef.current
      isRefreshRef.current = false

      const cached = !isForced ? getFreshCache(userId) : null
      if (cached) {
        if (!isCancelled) setSummary(cached)
        return
      }

      setIsLoading(true)

      try {
        const data = await loadUsageSummary(userId, isForced)

        if (!isCancelled) {
          setSummary(data)
        }
      } catch {
        if (!isCancelled) {
          setSummary(getFreshCache(userId) ?? EMPTY_USAGE_SUMMARY)
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false)
        }
      }
    }

    // Force refresh runs immediately (user action). Mount-time loads
    // wait for browser idle so image requests win the connection pool.
    if (isRefreshRef.current) {
      void loadSummary()
      return () => {
        isCancelled = true
      }
    }

    const cancelDefer = deferToIdle(() => {
      if (!isCancelled) void loadSummary()
    })

    return () => {
      isCancelled = true
      cancelDefer()
    }
  }, [isSignedIn, refreshKey, userId])

  return { summary, isLoading, refresh }
}
