'use client'

import { useEffect, useState } from 'react'
import { useUser } from '@clerk/nextjs'

import { fetchUsageSummary } from '@/lib/api-client'
import type { UsageSummary } from '@/types'

interface UseUsageSummaryReturn {
  summary: UsageSummary
  isLoading: boolean
}

const EMPTY_USAGE_SUMMARY: UsageSummary = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  last30DaysRequests: 0,
  lastRequestAt: null,
}

export function useUsageSummary(): UseUsageSummaryReturn {
  const { isSignedIn } = useUser()
  const [summary, setSummary] = useState<UsageSummary>(EMPTY_USAGE_SUMMARY)
  const [isLoading, setIsLoading] = useState(false)

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
  }, [isSignedIn])

  return { summary, isLoading }
}
