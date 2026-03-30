'use client'

import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'

import type { GenerationRecord, StudioGenerateRequest } from '@/types'
import { studioGenerateAPI } from '@/lib/api-client'

export interface UseStudioGenerateReturn {
  isGenerating: boolean
  lastGeneration: GenerationRecord | null
  generate: (input: StudioGenerateRequest) => Promise<GenerationRecord | null>
}

export function useStudioGenerate(): UseStudioGenerateReturn {
  const [isGenerating, setIsGenerating] = useState(false)
  const [lastGeneration, setLastGeneration] = useState<GenerationRecord | null>(
    null,
  )
  const t = useTranslations('StudioV2')

  const generate = useCallback(
    async (input: StudioGenerateRequest): Promise<GenerationRecord | null> => {
      setIsGenerating(true)
      try {
        const result = await studioGenerateAPI(input)
        if (result.success && result.data?.generation) {
          setLastGeneration(result.data.generation)
          toast.success(t('generateSuccess'))
          return result.data.generation
        }
        toast.error(result.error ?? t('generateFailed'))
        return null
      } finally {
        setIsGenerating(false)
      }
    },
    [t],
  )

  return { isGenerating, lastGeneration, generate }
}
