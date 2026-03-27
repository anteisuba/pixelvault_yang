'use client'

import { useCallback, useState } from 'react'

import { toggleFollowAPI } from '@/lib/api-client'

export interface UseFollowReturn {
  toggle: (targetUserId: string) => Promise<void>
  isPending: boolean
}

export function useFollow(
  onSuccess?: (
    targetUserId: string,
    following: boolean,
    followerCount: number,
  ) => void,
): UseFollowReturn {
  const [isPending, setIsPending] = useState(false)

  const toggle = useCallback(
    async (targetUserId: string) => {
      if (isPending) return
      setIsPending(true)
      try {
        const response = await toggleFollowAPI(targetUserId)
        if (response.success && response.data) {
          onSuccess?.(
            targetUserId,
            response.data.following,
            response.data.followerCount,
          )
        }
      } finally {
        setIsPending(false)
      }
    },
    [isPending, onSuccess],
  )

  return { toggle, isPending }
}
