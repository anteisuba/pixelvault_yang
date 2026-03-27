'use client'

import { useState, useEffect, useCallback } from 'react'

import { getMyProfileAPI } from '@/lib/api-client'

interface MyProfile {
  username: string
  displayName: string | null
  avatarUrl: string | null
  bio: string | null
  isPublic: boolean
}

let cachedProfile: MyProfile | null = null

export function useMyProfile() {
  const [profile, setProfile] = useState<MyProfile | null>(cachedProfile)

  const refresh = useCallback(() => {
    getMyProfileAPI().then((res) => {
      if (res.success && res.data) {
        const p = res.data as MyProfile
        cachedProfile = p
        setProfile(p)
      }
    })
  }, [])

  useEffect(() => {
    if (cachedProfile) return
    refresh()
  }, [refresh])

  return { profile, refresh }
}

/** Invalidate the cached profile so it re-fetches on next mount */
export function invalidateMyProfile() {
  cachedProfile = null
}
