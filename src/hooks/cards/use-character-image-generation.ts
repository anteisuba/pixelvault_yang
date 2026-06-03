'use client'

import { useCallback, useState } from 'react'

import {
  DEFAULT_ASPECT_RATIO,
  IMAGE_GENERATION,
  type AspectRatio,
} from '@/constants/config'
import {
  checkImageGenerationStatusAPI,
  studioGenerateAPI,
} from '@/lib/api-client'
import type { AdvancedParams, GenerationRecord } from '@/types'

const CHARACTER_IMAGE_GENERATION_FALLBACK_ERROR =
  'Character image generation failed'

interface CharacterImageGenerationInput {
  modelId: string
  freePrompt: string
  aspectRatio?: AspectRatio
  apiKeyId?: string
  referenceImages?: string[]
  advancedParams?: AdvancedParams
}

type CharacterImageGenerationResult =
  | {
      success: true
      generation: GenerationRecord
      imageUrl: string
    }
  | {
      success: false
      error: string
      errorCode?: string
      i18nKey?: string
    }

interface UseCharacterImageGenerationValue {
  generate(
    input: CharacterImageGenerationInput,
  ): Promise<CharacterImageGenerationResult>
  isLoading: boolean
  error: string | null
  errorCode: string | null
  reset(): void
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function waitForCharacterImageGeneration(
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

export function useCharacterImageGeneration(): UseCharacterImageGenerationValue {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<string | null>(null)

  const reset = useCallback(() => {
    setError(null)
    setErrorCode(null)
  }, [])

  const generate = useCallback(
    async (
      input: CharacterImageGenerationInput,
    ): Promise<CharacterImageGenerationResult> => {
      setIsLoading(true)
      setError(null)
      setErrorCode(null)

      try {
        const response = await studioGenerateAPI({
          modelId: input.modelId,
          apiKeyId: input.apiKeyId,
          freePrompt: input.freePrompt,
          aspectRatio: input.aspectRatio ?? DEFAULT_ASPECT_RATIO,
          referenceImages: input.referenceImages,
          advancedParams: input.advancedParams,
        })

        if (response.success && response.data?.jobId) {
          const generation = await waitForCharacterImageGeneration(
            response.data.jobId,
          )
          if (!generation) {
            const message = CHARACTER_IMAGE_GENERATION_FALLBACK_ERROR
            setError(message)
            setErrorCode(null)
            return {
              success: false,
              error: message,
            }
          }

          return {
            success: true,
            generation,
            imageUrl: generation.url,
          }
        }

        const message =
          response.error ?? CHARACTER_IMAGE_GENERATION_FALLBACK_ERROR
        setError(message)
        setErrorCode(response.errorCode ?? null)
        return {
          success: false,
          error: message,
          errorCode: response.errorCode,
          i18nKey: response.i18nKey,
        }
      } catch (caughtError) {
        const message =
          caughtError instanceof Error
            ? caughtError.message
            : CHARACTER_IMAGE_GENERATION_FALLBACK_ERROR
        setError(message)
        setErrorCode(null)
        return {
          success: false,
          error: message,
        }
      } finally {
        setIsLoading(false)
      }
    },
    [],
  )

  return {
    generate,
    isLoading,
    error,
    errorCode,
    reset,
  }
}
