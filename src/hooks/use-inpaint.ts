'use client'

import { useCallback, useState } from 'react'

import {
  inpaintImageAPI,
  outpaintImageAPI,
  type ImageEditApiResult,
} from '@/lib/api-client/image-edit'
import type { InpaintRequest, OutpaintRequest } from '@/types'

export function useInpaint() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ImageEditApiResult | null>(null)

  const inpaint = useCallback(
    async (params: InpaintRequest): Promise<ImageEditApiResult | null> => {
      setIsLoading(true)
      setError(null)

      try {
        const response = await inpaintImageAPI(params)
        if (!response.success || !response.data) {
          setError(response.error ?? 'Inpaint failed')
          return null
        }

        setResult(response.data)
        return response.data
      } catch (caughtError) {
        const message =
          caughtError instanceof Error ? caughtError.message : 'Inpaint failed'
        setError(message)
        return null
      } finally {
        setIsLoading(false)
      }
    },
    [],
  )

  const outpaint = useCallback(
    async (params: OutpaintRequest): Promise<ImageEditApiResult | null> => {
      setIsLoading(true)
      setError(null)

      try {
        const response = await outpaintImageAPI(params)
        if (!response.success || !response.data) {
          setError(response.error ?? 'Outpaint failed')
          return null
        }

        setResult(response.data)
        return response.data
      } catch (caughtError) {
        const message =
          caughtError instanceof Error ? caughtError.message : 'Outpaint failed'
        setError(message)
        return null
      } finally {
        setIsLoading(false)
      }
    },
    [],
  )

  return {
    inpaint,
    outpaint,
    isLoading,
    error,
    result,
  }
}
