'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@clerk/nextjs'

import { getMyProfileAPI } from '@/lib/api-client'
import { deferEffectTask } from '@/lib/defer-effect-task'

interface MyProfile {
  username: string
  displayName: string | null
  avatarUrl: string | null
  bio: string | null
  isPublic: boolean
}

let cachedProfile: MyProfile | null = null
let cachedUserId: string | null = null

export function useMyProfile() {
  const { userId } = useAuth()
  const [profile, setProfile] = useState<MyProfile | null>(() =>
    userId && cachedUserId === userId ? cachedProfile : null,
  )

  const refresh = useCallback(() => {
    getMyProfileAPI().then((res) => {
      if (res.success && res.data) {
        const p = res.data as MyProfile
        cachedProfile = p
        cachedUserId = userId ?? null
        setProfile(p)
      }
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
    if (cachedProfile && cachedUserId === userId) return
    return deferEffectTask(() => {
      refresh()
    })
  }, [userId, refresh])

  return { profile: userId ? profile : null, refresh }
}

/** Invalidate the cached profile so it re-fetches on next mount */
export function invalidateMyProfile() {
  cachedProfile = null
  cachedUserId = null
}
