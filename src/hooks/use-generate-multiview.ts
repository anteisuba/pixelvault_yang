'use client'

import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import type { GenerationRecord, MultiViewGenerateRequest } from '@/types'
import { generateMultiViewAPI } from '@/lib/api-client'

interface UseGenerateMultiViewReturn {
  isGenerating: boolean
  /** Newly generated views, in stable order [back, left, right]. */
  views: GenerationRecord[]
  generate: (params: MultiViewGenerateRequest) => Promise<GenerationRecord[]>
  reset: () => void
}

/**
 * Generate 3 alternate camera angles (back / left / right) of a source image
 * via the reference-edit chain. Returns whichever angles succeeded; partial
 * results are not failures since the user just needs one good view to pick.
 */
export function useGenerateMultiView(): UseGenerateMultiViewReturn {
  const [isGenerating, setIsGenerating] = useState(false)
  const [views, setViews] = useState<GenerationRecord[]>([])
  const t = useTranslations('MultiViewGenerate')

  const generate = useCallback(
    async (params: MultiViewGenerateRequest): Promise<GenerationRecord[]> => {
      setIsGenerating(true)
      try {
        const response = await generateMultiViewAPI(params)
        if (response.success && response.data) {
          setViews(response.data.views)
          if (response.data.views.length < 3) {
            toast.warning(
              t('partialSuccess', { count: response.data.views.length }),
            )
          } else {
            toast.success(t('success'))
          }
          return response.data.views
        }
        toast.error(response.error ?? t('failed'))
        return []
      } finally {
        setIsGenerating(false)
      }
    },
    [t],
  )

  const reset = useCallback(() => {
    setViews([])
  }, [])

  return { isGenerating, views, generate, reset }
}
