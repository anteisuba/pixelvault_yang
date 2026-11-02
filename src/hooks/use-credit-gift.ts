'use client'

import { useCallback, useState } from 'react'

import { grantCreditsAPI } from '@/lib/api-client'
import type { GrantCreditsRequest, GrantCreditsResult } from '@/types'

/** admin 给某人送点（设置 · 用量）。成功回对方名字与新余额，失败回一句原因。 */
export function useCreditGift() {
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const send = useCallback(
    async (
      request: GrantCreditsRequest,
    ): Promise<GrantCreditsResult | null> => {
      setIsSending(true)
      setError(null)
      try {
        return await grantCreditsAPI(request)
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught))
        return null
      } finally {
        setIsSending(false)
      }
    },
    [],
  )

  return { send, isSending, error }
}
