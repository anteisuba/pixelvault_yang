'use client'

import { useEffect, useRef } from 'react'
import { useAuth } from '@clerk/nextjs'

import { queryClient } from '@/lib/query-client'

/** 登录的人变了（退出 / 换号）就清空查询缓存：缓存里全是「我的」数据。 */
export function QueryUserBoundary() {
  const { isLoaded, userId } = useAuth()
  const lastUserRef = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    if (!isLoaded) return
    const current = userId ?? null
    if (lastUserRef.current !== undefined && lastUserRef.current !== current) {
      queryClient.clear()
    }
    lastUserRef.current = current
  }, [isLoaded, userId])

  return null
}
