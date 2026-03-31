'use client'

import { useState, useCallback, useEffect } from 'react'

import type { CreatorProfilePageData } from '@/types'
import { getCreatorProfileAPI } from '@/lib/api-client'
import { deferEffectTask } from '@/lib/defer-effect-task'

export interface UseCreatorProfileReturn {
  profile: CreatorProfilePageData | null
  isLoading: boolean
  error: string | null
  hasMore: boolean
  loadMore: () => Promise<void>
  isLoadingMore: boolean
  refresh: () => Promise<void>
}

export function useCreatorProfile(username: string): UseCreatorProfileReturn {
  const [profile, setProfile] = useState<CreatorProfilePageData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  const fetchProfile = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    const response = await getCreatorProfileAPI(username, 1)
    if (response.success && response.data) {
      setProfile(response.data)
      setPage(1)
    } else {
      setError(response.error ?? 'Failed to load profile')
    }
    setIsLoading(false)
  }, [username])

  const loadMore = useCallback(async () => {
    if (!profile || !profile.hasMore || isLoadingMore) return
    setIsLoadingMore(true)
    const nextPage = page + 1
    const response = await getCreatorProfileAPI(username, nextPage)
    if (response.success && response.data) {
      setProfile((prev) => {
        if (!prev) return response.data!
        return {
          ...response.data!,
          generations: [...prev.generations, ...response.data!.generations],
        }
      })
      setPage(nextPage)
    }
    setIsLoadingMore(false)
  }, [profile, page, username, isLoadingMore])

  useEffect(() => {
    return deferEffectTask(() => {
      void fetchProfile()
    })
  }, [fetchProfile])

  return {
    profile,
    isLoading,
    error,
    hasMore: profile?.hasMore ?? false,
    loadMore,
    isLoadingMore,
    refresh: fetchProfile,
  }
}
