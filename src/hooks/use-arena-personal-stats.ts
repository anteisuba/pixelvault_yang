'use client'

import { useCallback, useEffect, useState } from 'react'

import { getArenaPersonalStatsAPI } from '@/lib/api-client'
import type { PersonalModelStat } from '@/types'

interface UseArenaPersonalStatsReturn {
  totalMatches: number
  stats: PersonalModelStat[]
  isLoading: boolean
  error: string | null
  refresh: () => void
}

export function useArenaPersonalStats(): UseArenaPersonalStatsReturn {
  const [totalMatches, setTotalMatches] = useState(0)
  const [stats, setStats] = useState<PersonalModelStat[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchStats = useCallback(async () => {
    setIsLoading(true)
    const result = await getArenaPersonalStatsAPI()

    if (result.success && result.data) {
      setTotalMatches(result.data.totalMatches)
      setStats(result.data.stats)
      setError(null)
    } else {
      setError(result.error ?? 'Failed to load stats')
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    void fetchStats()
  }, [fetchStats])

  return { totalMatches, stats, isLoading, error, refresh: fetchStats }
}
