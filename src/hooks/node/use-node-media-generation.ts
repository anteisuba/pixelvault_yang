'use client'

import { useCallback, useState } from 'react'

import {
  AUDIO_GENERATION,
  DEFAULT_ASPECT_RATIO,
  IMAGE_GENERATION,
  VIDEO_GENERATION,
  type AspectRatio,
} from '@/constants/config'
import type { VideoResolution } from '@/constants/video-options'
import {
  checkAudioStatusAPI,
  checkImageGenerationStatusAPI,
  checkVideoStatusAPI,
  generateAudioAPI,
  studioGenerateAPI,
  submitVideoAPI,
} from '@/lib/api-client'
import type { AudioEmotion } from '@/constants/voice-cards'
import type { AdvancedParams, GenerationRecord } from '@/types'
import type { NodeWorkflowMediaKind } from '@/types/node-workflow'

const NODE_MEDIA_GENERATION_FALLBACK_ERROR = 'Node media generation failed'

interface NodeMediaGenerationInput {
  kind: Exclude<NodeWorkflowMediaKind, 'text'>
  modelId: string
  prompt: string
  apiKeyId?: string
  aspectRatio?: AspectRatio
  /**
   * Video duration in seconds (Seedance accepts 4-15) or the literal 'auto'
   * to let the model decide. Only consumed by video kind; other kinds ignore.
   */
  duration?: number | 'auto'
  /**
   * Video output resolution. Only consumed by video kind. When omitted the
   * provider builder falls back to its per-model default (720p for Seedance).
   */
  resolution?: VideoResolution
  referenceImages?: string[]
  /** Reference audio clips for voice cloning (Seedance reference-to-video). */
  audioUrls?: string[]
  /**
   * Voice-to-character bindings, when the Workbench can attribute each
   * audio clip to a named character (voice node wired through a character
   * node). Seedance Reference labels its @AudioN prompt tokens with the
   * binding's characterName when present.
   */
  audioBindings?: Array<{
    url: string
    characterName?: string
  }>
  /** Reference video clips (Seedance reference-to-video). */
  videoUrls?: string[]
  voiceId?: string
  referenceAudioUrl?: string
  referenceText?: string
  /** Fish TTS prosody — only consumed by audio kind. */
  speed?: number
  volume?: number
  /** Reading emotion → prompt prefix — only consumed by audio kind. */
  emotion?: AudioEmotion
  /** Negative prompt — only consumed by video kind. */
  negativePrompt?: string
  /** Per-node generate_audio override — only consumed by video kind. */
  generateAudio?: boolean
  /** Reproducibility seed — only consumed by video kind (seed-capable endpoints). */
  seed?: number
  advancedParams?: AdvancedParams
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
      pending?: true
    }

interface UseNodeMediaGenerationValue {
  generate(input: NodeMediaGenerationInput): Promise<NodeMediaGenerationResult>
  isLoading: boolean
  error: string | null
  reset(): void
}

function hasAudioJobId(
  data: { jobId?: string } | undefined,
): data is { jobId: string } {
  return Boolean(data && 'jobId' in data && data.jobId)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

type NodeMediaPollOutcome =
  | {
      status: 'completed'
      generation: GenerationRecord
    }
  | {
      status: 'failed'
      error: string
      errorCode?: string
      i18nKey?: string
    }
  | {
      status: 'pending'
    }

async function waitForVideoGeneration(
  jobId: string,
): Promise<NodeMediaPollOutcome> {
  for (
    let attempt = 0;
    attempt < VIDEO_GENERATION.MAX_POLL_ATTEMPTS;
    attempt += 1
  ) {
    let statusResponse: Awaited<ReturnType<typeof checkVideoStatusAPI>>
    try {
      statusResponse = await checkVideoStatusAPI(jobId)
    } catch {
      return { status: 'pending' }
    }

    if (!statusResponse.success || !statusResponse.data) {
      return { status: 'pending' }
    }

    if (statusResponse.data.status === 'COMPLETED') {
      return { status: 'completed', generation: statusResponse.data.generation }
    }

    if (statusResponse.data.status === 'FAILED') {
      return {
        status: 'failed',
        error:
          statusResponse.data.error ?? NODE_MEDIA_GENERATION_FALLBACK_ERROR,
        errorCode: statusResponse.data.errorCode,
        i18nKey: statusResponse.data.i18nKey,
      }
    }

    await delay(VIDEO_GENERATION.POLL_INTERVAL_MS)
  }

  return { status: 'pending' }
}

async function waitForImageGeneration(
  jobId: string,
): Promise<NodeMediaPollOutcome> {
  for (
    let attempt = 0;
    attempt < IMAGE_GENERATION.MAX_POLL_ATTEMPTS;
    attempt += 1
  ) {
    let statusResponse: Awaited<
      ReturnType<typeof checkImageGenerationStatusAPI>
    >
    try {
      statusResponse = await checkImageGenerationStatusAPI(jobId)
    } catch {
      return { status: 'pending' }
    }

    if (!statusResponse.success || !statusResponse.data) {
      return { status: 'pending' }
    }

    if (statusResponse.data.status === 'COMPLETED') {
      return { status: 'completed', generation: statusResponse.data.generation }
    }

    if (statusResponse.data.status === 'FAILED') {
      return {
        status: 'failed',
        error:
          statusResponse.data.error ?? NODE_MEDIA_GENERATION_FALLBACK_ERROR,
        errorCode: statusResponse.data.errorCode,
        i18nKey: statusResponse.data.i18nKey,
      }
    }

    await delay(IMAGE_GENERATION.POLL_INTERVAL_MS)
  }

  return { status: 'pending' }
}

async function waitForAudioGeneration(
  jobId: string,
): Promise<NodeMediaPollOutcome> {
  for (
    let attempt = 0;
    attempt < AUDIO_GENERATION.MAX_POLL_ATTEMPTS;
    attempt += 1
  ) {
    let statusResponse: Awaited<ReturnType<typeof checkAudioStatusAPI>>
    try {
      statusResponse = await checkAudioStatusAPI(jobId)
    } catch {
      return { status: 'pending' }
    }

    if (!statusResponse.success || !statusResponse.data) {
      return { status: 'pending' }
    }

    if (statusResponse.data.status === 'COMPLETED') {
      return { status: 'completed', generation: statusResponse.data.generation }
    }

    if (statusResponse.data.status === 'FAILED') {
      return {
        status: 'failed',
        error:
          statusResponse.data.error ?? NODE_MEDIA_GENERATION_FALLBACK_ERROR,
        errorCode: statusResponse.data.errorCode,
        i18nKey: statusResponse.data.i18nKey,
      }
    }

    await delay(AUDIO_GENERATION.POLL_INTERVAL_MS)
  }

  return { status: 'pending' }
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
        let pollOutcome: NodeMediaPollOutcome | null = null

        if (input.kind === 'image') {
          const response = await studioGenerateAPI({
            modelId: input.modelId,
            apiKeyId: input.apiKeyId,
            freePrompt: input.prompt,
            aspectRatio: input.aspectRatio ?? DEFAULT_ASPECT_RATIO,
            referenceImages: input.referenceImages,
            advancedParams: input.advancedParams,
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

          pollOutcome = await waitForImageGeneration(response.data.jobId)
        }

        if (input.kind === 'video') {
          const response = await submitVideoAPI({
            modelId: input.modelId,
            apiKeyId: input.apiKeyId,
            prompt: input.prompt,
            aspectRatio:
              input.aspectRatio ?? VIDEO_GENERATION.DEFAULT_ASPECT_RATIO,
            duration: input.duration ?? VIDEO_GENERATION.DEFAULT_DURATION,
            resolution: input.resolution,
            referenceImages: input.referenceImages,
            audioUrls: input.audioUrls,
            audioBindings: input.audioBindings,
            videoUrls: input.videoUrls,
            negativePrompt: input.negativePrompt,
            generateAudio: input.generateAudio,
            seed: input.seed,
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

          pollOutcome = await waitForVideoGeneration(response.data.jobId)
        }

        if (input.kind === 'audio') {
          const response = await generateAudioAPI({
            modelId: input.modelId,
            apiKeyId: input.apiKeyId,
            prompt: input.prompt,
            voiceId: input.voiceId,
            referenceAudioUrl: input.referenceAudioUrl,
            referenceText: input.referenceText,
            speed: input.speed,
            volume: input.volume,
            emotion: input.emotion,
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

          if (hasAudioJobId(response.data)) {
            pollOutcome = await waitForAudioGeneration(response.data.jobId)
          }
        }

        if (pollOutcome?.status === 'completed') {
          generation = pollOutcome.generation
        }

        if (pollOutcome?.status === 'failed') {
          setError(pollOutcome.error)
          return {
            success: false,
            error: pollOutcome.error,
            errorCode: pollOutcome.errorCode,
            i18nKey: pollOutcome.i18nKey,
          }
        }

        if (pollOutcome?.status === 'pending') {
          setError(NODE_MEDIA_GENERATION_FALLBACK_ERROR)
          return {
            success: false,
            error: NODE_MEDIA_GENERATION_FALLBACK_ERROR,
            pending: true,
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
