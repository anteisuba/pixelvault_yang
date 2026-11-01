'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@clerk/nextjs'

import { getModelUnitPriceByStringId } from '@/constants/models/unit-prices'
import {
  getDefaultProviderConfig,
  getProviderLabel,
  isAiAdapterType,
} from '@/constants/providers'
import { fetchMonthlyUsageByModel, fetchRunnerUsageAPI } from '@/lib/api-client'
import { deferToIdle } from '@/lib/defer-to-idle'
import type { RunnerUsageResult } from '@/types'
import type { MonthlyUsageSummary } from '@/types/usage'

export interface MonthlyProviderUsage {
  adapterType: string
  label: string
  requests: number
  /**
   * 估算花费（USD）。`null` = 这一家**没有任何一个模型有可信单价**，表上只显
   * 次数（D3 ④ usage 画板）。⚠ 部分有价时给出的是部分和 —— 整张表本来就标着
   * 「估算 · 以各 provider 账单为准」。
   */
  estimatedCostUsd: number | null
}

export interface MonthlyUsageView {
  month: string
  providers: MonthlyProviderUsage[]
  totalRequests: number
  totalEstimatedCostUsd: number | null
  runner: RunnerUsageResult | null
  isLoading: boolean
}

const EMPTY_SUMMARY: MonthlyUsageSummary = { month: '', rows: [] }

function labelOf(adapterType: string): string {
  return isAiAdapterType(adapterType)
    ? getProviderLabel(getDefaultProviderConfig(adapterType))
    : adapterType
}

function toProviderRows(summary: MonthlyUsageSummary): MonthlyProviderUsage[] {
  const byAdapter = new Map<
    string,
    { requests: number; cost: number; priced: boolean }
  >()

  for (const row of summary.rows) {
    const bucket = byAdapter.get(row.adapterType) ?? {
      requests: 0,
      cost: 0,
      priced: false,
    }
    bucket.requests += row.requests
    const price = getModelUnitPriceByStringId(row.modelId)
    if (price) {
      bucket.cost += price.amount * row.requests
      bucket.priced = true
    }
    byAdapter.set(row.adapterType, bucket)
  }

  return [...byAdapter.entries()]
    .map(([adapterType, bucket]) => ({
      adapterType,
      label: labelOf(adapterType),
      requests: bucket.requests,
      estimatedCostUsd: bucket.priced ? bucket.cost : null,
    }))
    .sort(
      (left, right) =>
        right.requests - left.requests || left.label.localeCompare(right.label),
    )
}

/**
 * `/settings/usage` 与 key 行「本月花费」共用的这一份月度用量。
 *
 * 次数来自 `ApiUsageLedger`（服务端只数数），花费在这里用
 * `MODEL_UNIT_PRICES` 现算 —— ⛔ 单价不进服务端，⛔ 不建统计表。
 */
export function useMonthlyUsage(): MonthlyUsageView & { refresh: () => void } {
  const { isSignedIn } = useAuth()
  const [summary, setSummary] = useState<MonthlyUsageSummary>(EMPTY_SUMMARY)
  const [runner, setRunner] = useState<RunnerUsageResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const refresh = useCallback(() => setRefreshKey((key) => key + 1), [])

  useEffect(() => {
    if (!isSignedIn) return
    let isCancelled = false

    const cancelDefer = deferToIdle(() => {
      if (isCancelled) return
      setIsLoading(true)
      void Promise.all([
        fetchMonthlyUsageByModel().catch(() => EMPTY_SUMMARY),
        fetchRunnerUsageAPI().catch(() => null),
      ]).then(([usage, runnerResult]) => {
        if (isCancelled) return
        setSummary(usage)
        setRunner(
          runnerResult?.success && runnerResult.data ? runnerResult.data : null,
        )
        setIsLoading(false)
      })
    })

    return () => {
      isCancelled = true
      cancelDefer()
    }
  }, [isSignedIn, refreshKey])

  const providers = useMemo(() => toProviderRows(summary), [summary])

  const totalRequests = providers.reduce((sum, row) => sum + row.requests, 0)
  const pricedProviders = providers.filter(
    (row) => row.estimatedCostUsd !== null,
  )
  const totalEstimatedCostUsd = pricedProviders.length
    ? pricedProviders.reduce((sum, row) => sum + (row.estimatedCostUsd ?? 0), 0)
    : null

  return {
    month: summary.month,
    providers,
    totalRequests,
    totalEstimatedCostUsd,
    runner,
    isLoading,
    refresh,
  }
}
