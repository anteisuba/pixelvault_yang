'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@clerk/nextjs'

import { getMyProfileAPI } from '@/lib/api-client'
import { deferEffectTask } from '@/lib/defer-effect-task'
import { deferToIdle } from '@/lib/defer-to-idle'
import type { UpdateProfileResponse } from '@/types'

type MyProfile = NonNullable<UpdateProfileResponse['data']>

let cachedProfile: MyProfile | null = null
let cachedUserId: string | null = null
let inFlightProfile: {
  userId: string
  request: Promise<MyProfile | null>
} | null = null

function getCachedProfile(userId: string): MyProfile | null {
  return cachedUserId === userId ? cachedProfile : null
}

async function loadMyProfile(
  userId: string,
  force: boolean,
): Promise<MyProfile | null> {
  if (!force) {
    const cached = getCachedProfile(userId)
    if (cached) return cached
    if (inFlightProfile?.userId === userId) return inFlightProfile.request
  }

  const request = getMyProfileAPI()
    .then((res) => {
      if (res.success && res.data) {
        cachedProfile = res.data
        cachedUserId = userId
        return res.data
      }
      return getCachedProfile(userId)
    })
    .finally(() => {
      if (inFlightProfile?.request === request) {
        inFlightProfile = null
      }
    })

  inFlightProfile = { userId, request }
  return request
}

export function useMyProfile() {
  const { userId } = useAuth()
  const [profile, setProfile] = useState<MyProfile | null>(() =>
    userId && cachedUserId === userId ? cachedProfile : null,
  )

  const refresh = useCallback(() => {
    if (!userId) return
    void loadMyProfile(userId, true).then((nextProfile) => {
      if (nextProfile) setProfile(nextProfile)
    })
  }, [userId])

  useEffect(() => {
    if (!userId) {
      cachedProfile = null
      cachedUserId = null
      return deferEffectTask(() => {
        setProfile(null)
      })
    }
    const cached = getCachedProfile(userId)
    if (cached) {
      return deferEffectTask(() => {
        setProfile(cached)
      })
    }
    return deferToIdle(() => {
      refresh()
    })
  }, [userId, refresh])

  return { profile: userId ? profile : null, refresh }
}

/** Invalidate the cached profile so it re-fetches on next mount */
export function invalidateMyProfile() {
  cachedProfile = null
  cachedUserId = null
  inFlightProfile = null
}
