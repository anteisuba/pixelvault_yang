'use client'

import { useCallback, useState } from 'react'

import {
  AUDIO_GENERATION,
  DEFAULT_ASPECT_RATIO,
  VIDEO_GENERATION,
  type AspectRatio,
} from '@/constants/config'
import {
  checkAudioStatusAPI,
  checkVideoStatusAPI,
  generateAudioAPI,
  studioGenerateAPI,
  submitVideoAPI,
} from '@/lib/api-client'
import type {
  AdvancedParams,
  GenerateAudioResponseData,
  GenerationRecord,
  VideoStatusResponseData,
} from '@/types'
import type { NodeWorkflowMediaKind } from '@/types/node-workflow'

const NODE_MEDIA_GENERATION_FALLBACK_ERROR = 'Node media generation failed'

interface NodeMediaGenerationInput {
  kind: Exclude<NodeWorkflowMediaKind, 'text'>
  modelId: string
  prompt: string
  apiKeyId?: string
  aspectRatio?: AspectRatio
  referenceImages?: string[]
  advancedParams?: AdvancedParams
  /** Voice id harvested from an upstream voice node — only used for video. */
  voiceId?: string
}

type NodeMediaGenerationResult =
  | {
      success: true
      generation: GenerationRecord
      mediaUrl: string
    }
  | {
      success: false
      error: string
      errorCode?: string
      i18nKey?: string
    }

interface UseNodeMediaGenerationValue {
  generate(input: NodeMediaGenerationInput): Promise<NodeMediaGenerationResult>
  isLoading: boolean
  error: string | null
  reset(): void
}

function hasGeneration(
  data: GenerateAudioResponseData | VideoStatusResponseData | undefined,
): data is { generation: GenerationRecord } {
  return Boolean(data && 'generation' in data && data.generation)
}

function hasAudioJobId(
  data: GenerateAudioResponseData | undefined,
): data is { jobId: string; requestId: string } {
  return Boolean(data && 'jobId' in data && data.jobId)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function waitForVideoGeneration(
  jobId: string,
): Promise<GenerationRecord | null> {
  for (
    let attempt = 0;
    attempt < VIDEO_GENERATION.MAX_POLL_ATTEMPTS;
    attempt += 1
  ) {
    const statusResponse = await checkVideoStatusAPI(jobId)
    if (!statusResponse.success || !statusResponse.data) {
      return null
    }

    if (statusResponse.data.status === 'COMPLETED') {
      return statusResponse.data.generation
    }

    if (statusResponse.data.status === 'FAILED') {
      return null
    }

    await delay(VIDEO_GENERATION.POLL_INTERVAL_MS)
  }

  return null
}

async function waitForAudioGeneration(
  jobId: string,
): Promise<GenerationRecord | null> {
  for (
    let attempt = 0;
    attempt < AUDIO_GENERATION.MAX_POLL_ATTEMPTS;
    attempt += 1
  ) {
    const statusResponse = await checkAudioStatusAPI(jobId)
    if (!statusResponse.success || !statusResponse.data) {
      return null
    }

    if (statusResponse.data.status === 'COMPLETED') {
      return statusResponse.data.generation
    }

    if (statusResponse.data.status === 'FAILED') {
      return null
    }

    await delay(AUDIO_GENERATION.POLL_INTERVAL_MS)
  }

  return null
}

export function useNodeMediaGeneration(): UseNodeMediaGenerationValue {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = useCallback(() => {
    setError(null)
  }, [])

  const generate = useCallback(
    async (
      input: NodeMediaGenerationInput,
    ): Promise<NodeMediaGenerationResult> => {
      setIsLoading(true)
      setError(null)

      try {
        let generation: GenerationRecord | null = null

        if (input.kind === 'image') {
          const response = await studioGenerateAPI({
            modelId: input.modelId,
            apiKeyId: input.apiKeyId,
            freePrompt: input.prompt,
            aspectRatio: input.aspectRatio ?? DEFAULT_ASPECT_RATIO,
            referenceImages: input.referenceImages,
            advancedParams: input.advancedParams,
          })

          if (!response.success || !hasGeneration(response.data)) {
            const message =
              response.error ?? NODE_MEDIA_GENERATION_FALLBACK_ERROR
            setError(message)
            return {
              success: false,
              error: message,
              errorCode: response.errorCode,
              i18nKey: response.i18nKey,
            }
          }

          generation = response.data.generation
        }

        if (input.kind === 'video') {
          const response = await submitVideoAPI({
            modelId: input.modelId,
            apiKeyId: input.apiKeyId,
            prompt: input.prompt,
            aspectRatio: VIDEO_GENERATION.DEFAULT_ASPECT_RATIO,
            duration: VIDEO_GENERATION.DEFAULT_DURATION,
            referenceImages: input.referenceImages,
            voiceId: input.voiceId,
          })

          if (!response.success || !response.data) {
            const message =
              response.error ?? NODE_MEDIA_GENERATION_FALLBACK_ERROR
            setError(message)
            return {
              success: false,
              error: message,
            }
          }

          generation = await waitForVideoGeneration(response.data.jobId)
        }

        if (input.kind === 'audio') {
          const response = await generateAudioAPI({
            modelId: input.modelId,
            apiKeyId: input.apiKeyId,
            prompt: input.prompt,
          })

          if (!response.success || !response.data) {
            const message =
              response.error ?? NODE_MEDIA_GENERATION_FALLBACK_ERROR
            setError(message)
            return {
              success: false,
              error: message,
              errorCode: response.errorCode,
              i18nKey: response.i18nKey,
            }
          }

          if (hasGeneration(response.data)) {
            generation = response.data.generation
          } else if (hasAudioJobId(response.data)) {
            generation = await waitForAudioGeneration(response.data.jobId)
          }
        }

        if (!generation) {
          setError(NODE_MEDIA_GENERATION_FALLBACK_ERROR)
          return {
            success: false,
            error: NODE_MEDIA_GENERATION_FALLBACK_ERROR,
          }
        }

        return {
          success: true,
          generation,
          mediaUrl: generation.url,
        }
      } catch (caughtError) {
        const message =
          caughtError instanceof Error
            ? caughtError.message
            : NODE_MEDIA_GENERATION_FALLBACK_ERROR
        setError(message)
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
    reset,
  }
}
