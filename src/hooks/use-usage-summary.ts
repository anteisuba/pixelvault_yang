'use client'

import { useCallback, useEffect, useState } from 'react'
import { useUser } from '@clerk/nextjs'

import { fetchUsageSummary } from '@/lib/api-client'
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

export function useUsageSummary(): UseUsageSummaryReturn {
  const { isSignedIn } = useUser()
  const [summary, setSummary] = useState<UsageSummary>(EMPTY_USAGE_SUMMARY)
  const [isLoading, setIsLoading] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1)
  }, [])

  useEffect(() => {
    let isCancelled = false

    async function loadSummary() {
      if (!isSignedIn) {
        if (!isCancelled) {
          setSummary(EMPTY_USAGE_SUMMARY)
          setIsLoading(false)
        }
        return
      }

      setIsLoading(true)

      try {
        const data = await fetchUsageSummary()

        if (!isCancelled) {
          setSummary(data)
        }
      } catch {
        if (!isCancelled) {
          setSummary(EMPTY_USAGE_SUMMARY)
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadSummary()

    return () => {
      isCancelled = true
    }
  }, [isSignedIn, refreshKey])

  return { summary, isLoading, refresh }
}
