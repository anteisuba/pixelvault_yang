'use client'

import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'

import { IMAGE_GENERATION } from '@/constants/config'
import type { GenerationRecord, StudioGenerateRequest } from '@/types'
import {
  checkImageGenerationStatusAPI,
  studioGenerateAPI,
} from '@/lib/api-client'

export interface UseStudioGenerateReturn {
  isGenerating: boolean
  lastGeneration: GenerationRecord | null
  generate: (input: StudioGenerateRequest) => Promise<GenerationRecord | null>
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function waitForGeneration(
  jobId: string,
): Promise<GenerationRecord | null> {
  for (
    let attempt = 0;
    attempt < IMAGE_GENERATION.MAX_POLL_ATTEMPTS;
    attempt += 1
  ) {
    const statusResponse = await checkImageGenerationStatusAPI(jobId)
    if (!statusResponse.success || !statusResponse.data) {
      return null
    }

    if (statusResponse.data.status === 'COMPLETED') {
      return statusResponse.data.generation
    }

    if (statusResponse.data.status === 'FAILED') {
      return null
    }

    await delay(IMAGE_GENERATION.POLL_INTERVAL_MS)
  }

  return null
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
        if (result.success && result.data?.jobId) {
          const generation = await waitForGeneration(result.data.jobId)
          if (!generation) {
            toast.error(t('generateFailed'))
            return null
          }
          setLastGeneration(generation)
          toast.success(t('generateSuccess'))
          return generation
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
