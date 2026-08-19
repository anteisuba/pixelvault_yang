'use client'

import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'

import {
  inpaintImageAPI,
  type ImageEditApiResult,
} from '@/lib/api-client/image-edit'
import type { InpaintRequest } from '@/types'

export function useInpaint() {
  const t = useTranslations('StudioV3')
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
          setError(response.error ?? t('inpaintEditor.failed'))
          return null
        }

        setResult(response.data)
        return response.data
      } catch (caughtError) {
        const message =
          caughtError instanceof Error
            ? caughtError.message
            : t('inpaintEditor.failed')
        setError(message)
        return null
      } finally {
        setIsLoading(false)
      }
    },
    [t],
  )

  return {
    inpaint,
    isLoading,
    error,
    result,
  }
}
