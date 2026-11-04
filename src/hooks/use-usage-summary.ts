'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useQuery } from '@tanstack/react-query'

import { QUERY_KEYS } from '@/constants/query'
import { fetchUsageSummary } from '@/lib/api-client'
import { deferToIdle } from '@/lib/defer-to-idle'
import { queryClient } from '@/lib/query-client'
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
}

/**
 * 用量摘要住共用查询（`QUERY_KEYS.usageSummary`）：切页回来先给手里那份，过期才后台
 * 对一遍。挂载时那一次等浏览器空下来再拉，让图片先占连接；`refresh()` 是用户动作，立刻拉。
 */
export function useUsageSummary(): UseUsageSummaryReturn {
  const { isSignedIn, userId } = useAuth()
  const [idle, setIdle] = useState(false)
  const queryKey = QUERY_KEYS.usageSummary(userId ?? null)

  useEffect(() => deferToIdle(() => setIdle(true)), [])

  const query = useQuery(
    {
      queryKey,
      queryFn: fetchUsageSummary,
      enabled: Boolean(isSignedIn && userId) && idle,
    },
    queryClient,
  )

  const refresh = useCallback(() => {
    if (!isSignedIn || !userId) return
    void queryClient
      .fetchQuery({
        queryKey: QUERY_KEYS.usageSummary(userId),
        queryFn: fetchUsageSummary,
        staleTime: 0,
      })
      .catch(() => {
        // 拉不到就留着手里那份。
      })
  }, [isSignedIn, userId])

  return {
    summary:
      isSignedIn && userId
        ? (query.data ?? EMPTY_USAGE_SUMMARY)
        : EMPTY_USAGE_SUMMARY,
    isLoading: query.isFetching,
    refresh,
  }
}
