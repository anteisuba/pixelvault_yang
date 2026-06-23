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
import { pollGenerationStatus } from '@/lib/poll-generation-status'
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

interface CharacterImageGenerationOptions {
  /**
   * Fired once the async job is created (jobId known), before polling begins.
   * The caller persists this id so a reload or poll-window timeout mid-flight
   * stays reconcilable instead of silently dropping the in-flight result.
   */
  onJobCreated?(jobId: string): void
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
      pending?: true
      /**
       * The submitted job's id, present when `pending` — the poll window closed
       * but the job is still running server-side. The caller persists this so a
       * later reconcile pass can backfill the result by jobId.
       */
      jobId?: string
    }

interface UseCharacterImageGenerationValue {
  generate(
    input: CharacterImageGenerationInput,
    options?: CharacterImageGenerationOptions,
  ): Promise<CharacterImageGenerationResult>
  isLoading: boolean
  error: string | null
  errorCode: string | null
  reset(): void
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
      options?: CharacterImageGenerationOptions,
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
          const jobId = response.data.jobId
          options?.onJobCreated?.(jobId)
          const pollOutcome = await pollGenerationStatus(
            jobId,
            checkImageGenerationStatusAPI,
            {
              maxAttempts: IMAGE_GENERATION.MAX_POLL_ATTEMPTS,
              intervalMs: IMAGE_GENERATION.POLL_INTERVAL_MS,
              fallbackError: CHARACTER_IMAGE_GENERATION_FALLBACK_ERROR,
            },
          )

          if (pollOutcome.status === 'failed') {
            setError(pollOutcome.error)
            setErrorCode(pollOutcome.errorCode ?? null)
            return {
              success: false,
              error: pollOutcome.error,
              errorCode: pollOutcome.errorCode,
              i18nKey: pollOutcome.i18nKey,
            }
          }

          if (pollOutcome.status === 'pending') {
            const message = CHARACTER_IMAGE_GENERATION_FALLBACK_ERROR
            setError(message)
            setErrorCode(null)
            return {
              success: false,
              error: message,
              pending: true,
              jobId,
            }
          }

          return {
            success: true,
            generation: pollOutcome.generation,
            imageUrl: pollOutcome.generation.url,
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
