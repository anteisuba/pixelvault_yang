'use client'

import { useCallback, useState } from 'react'

import { toggleLikeAPI } from '@/lib/api-client'

export interface UseLikeReturn {
  toggle: (generationId: string) => Promise<void>
  isPending: boolean
}

/**
 * Hook for toggling likes with optimistic updates.
 * Caller manages liked/likeCount state — this hook calls the API
 * and returns the result via onSuccess callback.
 */
export function useLike(
  onSuccess?: (generationId: string, liked: boolean, likeCount: number) => void,
): UseLikeReturn {
  const [isPending, setIsPending] = useState(false)

  const toggle = useCallback(
    async (generationId: string) => {
      if (isPending) return
      setIsPending(true)
      try {
        const response = await toggleLikeAPI(generationId)
        if (response.success && response.data) {
          onSuccess?.(
            generationId,
            response.data.liked,
            response.data.likeCount,
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
