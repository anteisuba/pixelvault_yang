'use client'

import { useCallback } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useQuery } from '@tanstack/react-query'

import { QUERY_KEYS } from '@/constants/query'
import { getMyProfileAPI } from '@/lib/api-client'
import { queryClient } from '@/lib/query-client'
import type { UpdateProfileResponse } from '@/types'

type MyProfile = NonNullable<UpdateProfileResponse['data']>

async function fetchMyProfile(): Promise<MyProfile | null> {
  const res = await getMyProfileAPI()
  if (res.success && res.data) return res.data
  throw new Error(res.error ?? 'Failed to load profile')
}

/**
 * 我的资料（头像、用户名…）。全站共用一份（`QUERY_KEYS.myProfile`）：对话列表、
 * 时间线头像、设置页同时挂着也只拉一次（2026-10-27 之前首次挂载各拉各的，一次切库 7 次）。
 */
export function useMyProfile() {
  const { userId } = useAuth()
  const query = useQuery(
    {
      queryKey: QUERY_KEYS.myProfile(userId ?? null),
      queryFn: fetchMyProfile,
      enabled: Boolean(userId),
    },
    queryClient,
  )

  const { refetch } = query
  const refresh = useCallback(async () => {
    if (!userId) return null
    const result = await refetch()
    return result.data ?? null
  }, [userId, refetch])

  return {
    profile: userId ? (query.data ?? null) : null,
    refresh,
    isLoading: query.isFetching,
  }
}

/** Invalidate the cached profile so it re-fetches on next mount */
export function invalidateMyProfile() {
  void queryClient.invalidateQueries({
    queryKey: [QUERY_KEYS.myProfile(null)[0]],
  })
}
