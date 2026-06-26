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
import {
  pollGenerationStatus,
  type GenerationPollOutcome,
} from '@/lib/poll-generation-status'
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
  /** Audio cover image (by reference) — only consumed by audio kind; lands on
   *  the generation's previewUrl so the clip carries a cover into 素材库. */
  coverImageUrl?: string
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
      /**
       * The submitted job's id, present when `pending` — the poll window closed
       * but the job is still running server-side. The caller persists this so a
       * later reconcile pass can backfill the result by jobId.
       */
      jobId?: string
    }

interface NodeMediaGenerationOptions {
  /**
   * Fired once the async job is created (jobId known), before polling begins.
   * The caller persists this id so a reload or poll-window timeout mid-flight
   * stays reconcilable instead of silently dropping the in-flight result.
   */
  onJobCreated?(jobId: string): void
}

interface UseNodeMediaGenerationValue {
  generate(
    input: NodeMediaGenerationInput,
    options?: NodeMediaGenerationOptions,
  ): Promise<NodeMediaGenerationResult>
  isLoading: boolean
  error: string | null
  reset(): void
}

function hasAudioJobId(
  data: { jobId?: string } | undefined,
): data is { jobId: string } {
  return Boolean(data && 'jobId' in data && data.jobId)
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
      options?: NodeMediaGenerationOptions,
    ): Promise<NodeMediaGenerationResult> => {
      setIsLoading(true)
      setError(null)

      try {
        let generation: GenerationRecord | null = null
        let pollOutcome: GenerationPollOutcome | null = null
        // Captured so a poll-window timeout can hand the still-running job's id
        // back to the caller, which persists it for later reconciliation.
        let pendingJobId: string | null = null

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

          pendingJobId = response.data.jobId
          options?.onJobCreated?.(response.data.jobId)
          pollOutcome = await pollGenerationStatus(
            response.data.jobId,
            checkImageGenerationStatusAPI,
            {
              maxAttempts: IMAGE_GENERATION.MAX_POLL_ATTEMPTS,
              intervalMs: IMAGE_GENERATION.POLL_INTERVAL_MS,
              fallbackError: NODE_MEDIA_GENERATION_FALLBACK_ERROR,
            },
          )
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

          pendingJobId = response.data.jobId
          options?.onJobCreated?.(response.data.jobId)
          pollOutcome = await pollGenerationStatus(
            response.data.jobId,
            checkVideoStatusAPI,
            {
              maxAttempts: VIDEO_GENERATION.MAX_POLL_ATTEMPTS,
              intervalMs: VIDEO_GENERATION.POLL_INTERVAL_MS,
              fallbackError: NODE_MEDIA_GENERATION_FALLBACK_ERROR,
            },
          )
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
            coverImageUrl: input.coverImageUrl,
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
            pendingJobId = response.data.jobId
            options?.onJobCreated?.(response.data.jobId)
            pollOutcome = await pollGenerationStatus(
              response.data.jobId,
              checkAudioStatusAPI,
              {
                maxAttempts: AUDIO_GENERATION.MAX_POLL_ATTEMPTS,
                intervalMs: AUDIO_GENERATION.POLL_INTERVAL_MS,
                fallbackError: NODE_MEDIA_GENERATION_FALLBACK_ERROR,
              },
            )
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
            jobId: pendingJobId ?? undefined,
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
