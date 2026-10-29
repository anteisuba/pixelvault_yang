'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

import { TIME_ZONE_COOKIE } from '@/i18n/time-zone'

/**
 * 把这台机器的时区写进 cookie；和服务端用的那个不一样就刷新一次，让时间按本地显示。
 * 只在第一次来、或换了时区时刷一次。
 */
export function TimeZoneSync({ current }: { current: string | undefined }) {
  const router = useRouter()
  useEffect(() => {
    const local = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (!local || local === current) return
    document.cookie = `${TIME_ZONE_COOKIE}=${encodeURIComponent(local)}; path=/; max-age=31536000; samesite=lax`
    router.refresh()
  }, [current, router])
  return null
}
