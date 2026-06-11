'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  AUDIO_GENERATION,
  IMAGE_GENERATION,
  VIDEO_GENERATION,
} from '@/constants/config'
import type { AudioFormat, AudioLatency } from '@/constants/audio-options'
import {
  AUDIO_EMOTIONS,
  AUDIO_PAUSE_MARKERS,
  AUDIO_PACES,
  type AudioEmotion,
  type AudioPace,
} from '@/constants/voice-cards'
import { VARIANT_COUNT, VARIANT_MAX_SEED } from '@/constants/studio'
import {
  GENERATION_ERROR_CODES,
  type GenerationErrorCode,
  normalizeErrorCode,
  parseGenerationErrorCode,
} from '@/constants/generation-errors'
import { galleryGenerationPath } from '@/constants/routes'
import { getGenerationErrorMessage } from '@/lib/api-error-message'
import type {
  ActiveRun,
  GenerateAudioResponseData,
  GenerationRecord,
  RunGroupMode,
  RunItem,
  StudioGenerateRequest,
  StudioGenerateResponseData,
  GenerateVideoRequest,
} from '@/types'
import {
  checkAudioStatusAPI,
  checkImageGenerationStatusAPI,
  studioGenerateAPI,
  studioSelectWinnerAPI,
  submitVideoAPI,
  checkVideoStatusAPI,
  generateAudioAPI,
} from '@/lib/api-client'
import { useRouter } from '@/i18n/navigation'
import { mergeStackLoras } from '@/lib/merge-stack-loras'
import { useActiveLoraStack } from '@/hooks/use-active-lora-stack'

// ─── Types ───────────────────────────────────────────────────────

export type GenerationStage =
  | 'idle'
  | 'generating'
  | 'queued'
  | 'processing'
  | 'uploading'

export type GenerationMode = 'image' | 'video' | 'audio'

export interface AudioGenerateInput {
  modelId: string
  apiKeyId?: string
  freePrompt?: string
  voiceId?: string
  referenceAudioUrl?: string
  referenceText?: string
  emotion?: string
  pace?: string
  pauseMarkers?: string[]
  pronunciationDictionary?: Record<string, string>
  speed?: number
  volume?: number
  normalizeLoudness?: boolean
  normalizeText?: boolean
  withTimestamps?: boolean
  format?: AudioFormat
  sampleRate?: number
  mp3Bitrate?: number
  opusBitrate?: number
  latency?: AudioLatency
  temperature?: number
  topP?: number
  chunkLength?: number
  repetitionPenalty?: number
  speakerVoiceIds?: string[]
}

export interface CompareModelSelection {
  modelId: string
  apiKeyId?: string
}

export interface UnifiedGenerateInput {
  mode: GenerationMode
  image?: StudioGenerateRequest
  video?: GenerateVideoRequest
  audio?: AudioGenerateInput
  /** B5: Run group mode — 'variant' triggers 4-seed parallel generation */
  runMode?: RunGroupMode
  /** B4: Models to compare (used when runMode === 'compare') */
  compareModels?: CompareModelSelection[]
}

export interface UseUnifiedGenerateReturn {
  isGenerating: boolean
  stage: GenerationStage
  elapsedSeconds: number
  error: string | null
  errorCode: GenerationErrorCode | null
  lastGeneration: GenerationRecord | null
  generate: (input: UnifiedGenerateInput) => Promise<GenerationRecord | null>
  retry: () => Promise<GenerationRecord | null>
  reset: () => void
  /** B0: Active generation run with per-item tracking */
  activeRun: ActiveRun | null
  /** B5: Select a variant as winner */
  selectWinner: (generationId: string) => Promise<void>
}

function isAudioEmotion(value: string | undefined): value is AudioEmotion {
  return AUDIO_EMOTIONS.includes(value as AudioEmotion)
}

function isAudioPace(value: string | undefined): value is AudioPace {
  return AUDIO_PACES.includes(value as AudioPace)
}

function isAudioPauseMarker(
  value: string,
): value is (typeof AUDIO_PAUSE_MARKERS)[number] {
  return AUDIO_PAUSE_MARKERS.includes(
    value as (typeof AUDIO_PAUSE_MARKERS)[number],
  )
}

function hasJobId(
  data: GenerateAudioResponseData | StudioGenerateResponseData | undefined,
): data is Extract<
  GenerateAudioResponseData | StudioGenerateResponseData,
  { jobId: string }
> {
  return typeof data?.jobId === 'string' && data.jobId.length > 0
}

function waitForPollInterval(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function toCompletedRunItem<T extends RunItem>(
  item: T,
  generation: GenerationRecord,
) {
  return {
    ...item,
    status: 'completed' as const,
    generation,
    error: null,
  }
}

function toFailedRunItem<T extends RunItem>(item: T, error: string) {
  return {
    ...item,
    status: 'failed' as const,
    generation: null,
    error,
  }
}

// Outcome of polling an async image job. `pending` means the poll window ran
// out while the worker was still producing the image — that is NOT a failure
// (the image lands in the gallery via callback), so it must never be surfaced
// as one. Only `failed` (the server reported FAILED) is a real failure.
type ImageJobPollOutcome =
  | { status: 'completed'; generation: GenerationRecord }
  | { status: 'failed'; message: string; code: GenerationErrorCode }
  | { status: 'pending' }

// ─── Hook ────────────────────────────────────────────────────────

export function useUnifiedGenerate(): UseUnifiedGenerateReturn {
  const [isGenerating, setIsGenerating] = useState(false)
  const [stage, setStage] = useState<GenerationStage>('idle')
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<GenerationErrorCode | null>(null)
  const [lastGeneration, setLastGeneration] = useState<GenerationRecord | null>(
    null,
  )
  const [activeRun, setActiveRun] = useState<ActiveRun | null>(null)

  const lastRequestRef = useRef<UnifiedGenerateInput | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollCountRef = useRef(0)
  const singleImageInFlightRef = useRef(false)

  const tStudio = useTranslations('StudioV2')
  const tVideo = useTranslations('VideoGenerate')
  const tErrors = useTranslations('Errors')
  const router = useRouter()

  // 审查 D1：完成提示必须给"去向"——附"查看作品"直达动作，用户不再
  // 以为结果丢了。以 generation.id 作 toast id，变体/对比多次完成时去重。
  const notifySaved = useCallback(
    (generation: GenerationRecord | null | undefined, message: string) => {
      if (generation?.id) {
        toast.success(message, {
          id: `generation-saved-${generation.id}`,
          action: {
            label: tStudio('viewInGallery'),
            onClick: () => router.push(galleryGenerationPath(generation.id)),
          },
        })
      } else {
        toast.success(message)
      }
    },
    [router, tStudio],
  )

  // Active LoRA stack — read at generate() time via a ref so the
  // useCallback identity stays stable across stack edits.
  const loraStack = useActiveLoraStack()
  const loraStackRef = useRef(loraStack)
  loraStackRef.current = loraStack

  // ── Timer/polling lifecycle ────────────────────────────────────

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    pollCountRef.current = 0
  }, [])

  const startTimer = useCallback(() => {
    stopTimer()
    setElapsedSeconds(0)
    timerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1)
    }, 1000)
  }, [stopTimer])

  const finish = useCallback(
    (err?: string, code?: GenerationErrorCode | null) => {
      stopPolling()
      stopTimer()
      setIsGenerating(false)
      setStage('idle')
      if (err) {
        setError(err)
        setErrorCode(code ?? null)
        toast.error(err)
      }
    },
    [stopPolling, stopTimer],
  )

  useEffect(() => {
    return () => {
      stopTimer()
      stopPolling()
    }
  }, [stopTimer, stopPolling])

  const updateActiveRunItem = useCallback(
    (itemId: string, updater: (item: RunItem) => RunItem) => {
      setActiveRun((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((item) =>
                item.id === itemId ? updater(item) : item,
              ),
            }
          : null,
      )
    },
    [],
  )

  const markActiveRunItemCompleted = useCallback(
    (itemId: string, generation: GenerationRecord) => {
      updateActiveRunItem(itemId, (item) =>
        toCompletedRunItem(item, generation),
      )
    },
    [updateActiveRunItem],
  )

  const markActiveRunItemFailed = useCallback(
    (itemId: string, errorMessage: string) => {
      updateActiveRunItem(itemId, (item) => toFailedRunItem(item, errorMessage))
    },
    [updateActiveRunItem],
  )

  // Resolve an API error payload into both a localized message (for display)
  // and a classification code (for the error dialog to pick its reason).
  const resolveGenerationError = useCallback(
    (
      payload: { error?: string; errorCode?: string; i18nKey?: string },
      fallback: string,
    ): { message: string; code: GenerationErrorCode } => ({
      message: getGenerationErrorMessage(tErrors, payload, fallback),
      code:
        normalizeErrorCode(payload.errorCode) ??
        parseGenerationErrorCode(payload.error ?? ''),
    }),
    [tErrors],
  )

  // Authoritative resolution of a finished image job from its server status.
  // Used when the poll window is exhausted: the worker (not the poll loop) is
  // the source of truth, so a generated image — already COMPLETED and in the
  // gallery — is never reported as a failure just because the UI stopped
  // polling. A still-RUNNING job resolves to `pending`, not a failure.
  const resolveImageJobFromStatus = useCallback(
    async (jobId: string, itemId: string): Promise<ImageJobPollOutcome> => {
      try {
        const statusResponse = await checkImageGenerationStatusAPI(jobId)
        if (statusResponse.success && statusResponse.data) {
          if (statusResponse.data.status === 'COMPLETED') {
            const generation = statusResponse.data.generation
            markActiveRunItemCompleted(itemId, generation)
            return { status: 'completed', generation }
          }
          if (statusResponse.data.status === 'FAILED') {
            const failure = resolveGenerationError(
              statusResponse.data,
              tStudio('generateFailed'),
            )
            markActiveRunItemFailed(itemId, failure.message)
            return { status: 'failed', ...failure }
          }
        }
      } catch {
        // Unknown — treat as still-pending, never a confirmed failure.
      }
      return { status: 'pending' }
    },
    [
      tStudio,
      markActiveRunItemCompleted,
      markActiveRunItemFailed,
      resolveGenerationError,
    ],
  )

  // ── Image generation (worker submit + poll) ───────────────────

  const generateImage = useCallback(
    async (input: StudioGenerateRequest): Promise<GenerationRecord | null> => {
      if (singleImageInFlightRef.current) return null
      singleImageInFlightRef.current = true

      setIsGenerating(true)
      setStage('generating')
      setError(null)
      setErrorCode(null)
      startTimer()

      // B0: Create ActiveRun with single item
      const itemId = crypto.randomUUID()
      setActiveRun({
        id: crypto.randomUUID(),
        mode: 'single',
        items: [
          {
            id: itemId,
            modelId: input.modelId ?? 'unknown',
            status: 'generating',
            generation: null,
            error: null,
          },
        ],
        selectedItemId: itemId,
        prompt: input.freePrompt ?? '',
        startedAt: Date.now(),
      })

      try {
        const result = await studioGenerateAPI(input)

        if (result.success && hasJobId(result.data)) {
          const { jobId } = result.data
          setStage('processing')
          pollCountRef.current = 0

          return await new Promise<GenerationRecord | null>((resolve) => {
            pollRef.current = setInterval(async () => {
              pollCountRef.current += 1

              if (pollCountRef.current > IMAGE_GENERATION.MAX_POLL_ATTEMPTS) {
                // Poll window exhausted. Don't blind-fail: check the job's
                // authoritative status once more. A generated image (COMPLETED,
                // already in the gallery) must never be reported as a failure
                // just because we stopped polling.
                const outcome = await resolveImageJobFromStatus(jobId, itemId)
                if (outcome.status === 'completed') {
                  setLastGeneration(outcome.generation)
                  finish()
                  notifySaved(outcome.generation, tStudio('generateSuccess'))
                  resolve(outcome.generation)
                } else if (outcome.status === 'failed') {
                  finish(outcome.message, outcome.code)
                  resolve(null)
                } else {
                  // Still running on the worker — it will finish and land in
                  // the gallery via callback. Say so, don't claim failure.
                  finish()
                  toast.info(tStudio('stillProcessingHint'))
                  resolve(null)
                }
                return
              }

              try {
                const statusResponse =
                  await checkImageGenerationStatusAPI(jobId)

                // Transient status-API error — skip this tick and keep polling
                // rather than fail a run the worker may still be completing.
                if (!statusResponse.success || !statusResponse.data) return

                const statusData = statusResponse.data

                if (statusData.status === 'COMPLETED') {
                  const generation = statusData.generation
                  setLastGeneration(generation)
                  markActiveRunItemCompleted(itemId, generation)
                  finish()
                  notifySaved(generation, tStudio('generateSuccess'))
                  resolve(generation)
                  return
                }

                if (statusData.status === 'FAILED') {
                  const { message, code } = resolveGenerationError(
                    statusData,
                    tStudio('generateFailed'),
                  )
                  markActiveRunItemFailed(itemId, message)
                  finish(message, code)
                  resolve(null)
                  return
                }

                if (statusData.status === 'IN_QUEUE') {
                  setStage('queued')
                  return
                }

                if (statusData.status === 'IN_PROGRESS') {
                  setStage('processing')
                }
              } catch {
                // Transient network blip — skip this tick, keep polling.
              }
            }, IMAGE_GENERATION.POLL_INTERVAL_MS)
          })
        }

        const { message, code } = resolveGenerationError(
          result,
          tStudio('generateFailed'),
        )
        setError(message)
        setErrorCode(code)
        markActiveRunItemFailed(itemId, message)
        return null
      } finally {
        singleImageInFlightRef.current = false
        stopTimer()
        setIsGenerating(false)
        setStage('idle')
      }
    },
    [
      tStudio,
      notifySaved,
      startTimer,
      stopTimer,
      finish,
      markActiveRunItemCompleted,
      markActiveRunItemFailed,
      resolveGenerationError,
      resolveImageJobFromStatus,
    ],
  )

  const pollImageJobForRunItem = useCallback(
    async (jobId: string, itemId: string): Promise<ImageJobPollOutcome> => {
      for (
        let attempt = 1;
        attempt <= IMAGE_GENERATION.MAX_POLL_ATTEMPTS;
        attempt += 1
      ) {
        await waitForPollInterval(IMAGE_GENERATION.POLL_INTERVAL_MS)

        try {
          const statusResponse = await checkImageGenerationStatusAPI(jobId)

          // Transient status-API error — skip this tick rather than fail a run
          // the worker may still be completing.
          if (!statusResponse.success || !statusResponse.data) continue

          const statusData = statusResponse.data

          if (statusData.status === 'COMPLETED') {
            const generation = statusData.generation
            markActiveRunItemCompleted(itemId, generation)
            return { status: 'completed', generation }
          }

          if (statusData.status === 'FAILED') {
            const failure = resolveGenerationError(
              statusData,
              tStudio('generateFailed'),
            )
            markActiveRunItemFailed(itemId, failure.message)
            return { status: 'failed', ...failure }
          }
        } catch {
          // Transient network blip — skip this tick, keep polling.
          continue
        }
      }

      // Poll window exhausted: trust the authoritative job status instead of
      // assuming failure — the worker may have produced the image already.
      return resolveImageJobFromStatus(jobId, itemId)
    },
    [
      tStudio,
      markActiveRunItemCompleted,
      markActiveRunItemFailed,
      resolveImageJobFromStatus,
      resolveGenerationError,
    ],
  )

  // ── Video generation (async queue + polling) ──────────────────

  const generateVideo = useCallback(
    async (params: GenerateVideoRequest): Promise<GenerationRecord | null> => {
      setIsGenerating(true)
      setError(null)
      setErrorCode(null)
      setStage('queued')
      startTimer()

      // B0: Create ActiveRun for video generation
      const itemId = crypto.randomUUID()
      setActiveRun({
        id: crypto.randomUUID(),
        mode: 'single',
        items: [
          {
            id: itemId,
            modelId: params.modelId,
            status: 'generating',
            generation: null,
            error: null,
          },
        ],
        selectedItemId: itemId,
        prompt: params.prompt,
        startedAt: Date.now(),
      })

      try {
        const submitResponse = await submitVideoAPI(params)
        if (!submitResponse.success || !submitResponse.data) {
          const { message, code } = resolveGenerationError(
            submitResponse,
            tVideo('errorFallback'),
          )
          markActiveRunItemFailed(itemId, message)
          finish(message, code)
          return null
        }

        const { jobId } = submitResponse.data
        setStage('processing')
        pollCountRef.current = 0

        return await new Promise<GenerationRecord | null>((resolve) => {
          pollRef.current = setInterval(async () => {
            pollCountRef.current += 1

            if (pollCountRef.current > VIDEO_GENERATION.MAX_POLL_ATTEMPTS) {
              markActiveRunItemFailed(itemId, tVideo('errorTimeout'))
              finish(
                tVideo('errorTimeout'),
                GENERATION_ERROR_CODES.PROVIDER_TIMEOUT,
              )
              resolve(null)
              return
            }

            try {
              const statusResponse = await checkVideoStatusAPI(jobId)

              if (!statusResponse.success || !statusResponse.data) {
                if (
                  pollCountRef.current <= VIDEO_GENERATION.EARLY_POLL_TOLERANCE
                ) {
                  return
                }
                const { message, code } = resolveGenerationError(
                  statusResponse,
                  tVideo('errorFallback'),
                )
                markActiveRunItemFailed(itemId, message)
                finish(message, code)
                resolve(null)
                return
              }

              const statusData = statusResponse.data

              if (statusData.status === 'COMPLETED') {
                const generation = statusData.generation
                setLastGeneration(generation)
                markActiveRunItemCompleted(itemId, generation)
                finish()
                notifySaved(generation, tVideo('toastSuccess'))
                resolve(generation)
                return
              }

              if (statusData.status === 'FAILED') {
                const { message, code } = resolveGenerationError(
                  statusResponse,
                  tVideo('errorFallback'),
                )
                markActiveRunItemFailed(itemId, message)
                finish(message, code)
                resolve(null)
                return
              }

              if (statusData.status === 'IN_QUEUE') {
                setStage('queued')
                return
              }

              if (statusData.status === 'IN_PROGRESS') {
                setStage('processing')
              }
            } catch {
              markActiveRunItemFailed(itemId, tVideo('errorUnexpected'))
              finish(tVideo('errorUnexpected'))
              resolve(null)
            }
          }, VIDEO_GENERATION.POLL_INTERVAL_MS)
        })
      } catch (err) {
        const message =
          err instanceof Error ? err.message : tVideo('errorUnexpected')
        finish(message)
        return null
      }
    },
    [
      tVideo,
      notifySaved,
      resolveGenerationError,
      startTimer,
      finish,
      markActiveRunItemCompleted,
      markActiveRunItemFailed,
    ],
  )

  // ── B5: Variant generation (parallel seeds) ───────────────────

  const generateVariants = useCallback(
    async (input: StudioGenerateRequest): Promise<GenerationRecord | null> => {
      setIsGenerating(true)
      setStage('generating')
      setError(null)
      setErrorCode(null)
      startTimer()

      const runGroupId = crypto.randomUUID()
      const seeds = Array.from({ length: VARIANT_COUNT }, () =>
        Math.floor(Math.random() * VARIANT_MAX_SEED),
      )
      const items = seeds.map((seed, idx) => ({
        id: crypto.randomUUID(),
        modelId: input.modelId ?? 'unknown',
        status: 'generating' as const,
        generation: null,
        error: null,
        seed,
        index: idx,
      }))

      setActiveRun({
        id: runGroupId,
        mode: 'variant',
        items,
        selectedItemId: null,
        prompt: input.freePrompt ?? '',
        startedAt: Date.now(),
      })

      try {
        // Each item resolves to its own UI update as soon as the API
        // returns, instead of blocking on the slowest seed before any
        // result lands. `firstSuccess` is whichever variant finishes
        // first — the natural "show me the fastest preview" behaviour.
        let firstSuccess: GenerationRecord | null = null
        let anyFailed = false
        const firstFailure = {
          current: null as {
            message: string
            code: GenerationErrorCode
          } | null,
        }

        const tasks = items.map(async (item) => {
          try {
            const result = await studioGenerateAPI({
              ...input,
              seed: item.seed,
              runGroupId,
              runGroupType: 'variant',
              runGroupIndex: item.index,
            })
            if (result.success && hasJobId(result.data)) {
              setStage('processing')
              const outcome = await pollImageJobForRunItem(
                result.data.jobId,
                item.id,
              )
              if (outcome.status === 'completed') {
                if (!firstSuccess) firstSuccess = outcome.generation
              } else if (outcome.status === 'failed') {
                anyFailed = true
                firstFailure.current ??= {
                  message: outcome.message,
                  code: outcome.code,
                }
              }
            } else {
              const failure = resolveGenerationError(
                result,
                tStudio('generateFailed'),
              )
              markActiveRunItemFailed(item.id, failure.message)
              anyFailed = true
              firstFailure.current ??= failure
            }
          } catch (error) {
            const failure = resolveGenerationError(
              {
                error:
                  error instanceof Error
                    ? error.message
                    : tStudio('generateFailed'),
              },
              tStudio('generateFailed'),
            )
            markActiveRunItemFailed(item.id, failure.message)
            anyFailed = true
            firstFailure.current ??= failure
          }
        })

        await Promise.allSettled(tasks)

        if (firstSuccess) {
          setLastGeneration(firstSuccess)
          notifySaved(firstSuccess, tStudio('variantSuccess'))
        } else if (anyFailed) {
          setError(firstFailure.current?.message ?? tStudio('generateFailed'))
          setErrorCode(firstFailure.current?.code ?? null)
        } else {
          // Every variant is still generating on the worker — not a failure.
          toast.info(tStudio('stillProcessingHint'))
        }

        return firstSuccess
      } finally {
        stopTimer()
        setIsGenerating(false)
        setStage('idle')
      }
    },
    [
      tStudio,
      notifySaved,
      startTimer,
      stopTimer,
      pollImageJobForRunItem,
      markActiveRunItemFailed,
      resolveGenerationError,
    ],
  )

  // ── B5: Select variant winner ─────────────────────────────────

  const selectWinner = useCallback(
    async (generationId: string): Promise<void> => {
      const runGroupId = activeRun?.id
      if (
        !runGroupId ||
        (activeRun?.mode !== 'variant' && activeRun?.mode !== 'compare')
      )
        return

      // Optimistic update
      setActiveRun((prev) =>
        prev ? { ...prev, selectedItemId: generationId } : null,
      )

      const selectedGen = activeRun.items.find(
        (item) => item.generation?.id === generationId,
      )?.generation
      if (selectedGen) {
        setLastGeneration(selectedGen)
      }

      const result = await studioSelectWinnerAPI({
        runGroupId,
        generationId,
      })
      if (!result.success) {
        toast.error(result.error ?? tStudio('generateFailed'))
      }
    },
    [activeRun, tStudio],
  )

  // ── B4: Compare generation (parallel models) ──────────────────

  const generateCompare = useCallback(
    async (
      input: StudioGenerateRequest,
      models: CompareModelSelection[],
    ): Promise<GenerationRecord | null> => {
      setIsGenerating(true)
      setStage('generating')
      setError(null)
      setErrorCode(null)
      startTimer()

      const runGroupId = crypto.randomUUID()
      const items = models.map((model, idx) => ({
        id: crypto.randomUUID(),
        modelId: model.modelId,
        status: 'generating' as const,
        generation: null,
        error: null,
        apiKeyId: model.apiKeyId,
        index: idx,
      }))

      setActiveRun({
        id: runGroupId,
        mode: 'compare',
        items,
        selectedItemId: null,
        prompt: input.freePrompt ?? '',
        startedAt: Date.now(),
      })

      try {
        // Each model in the compare set updates its own tile as soon as
        // its API call returns — fast providers no longer wait for the
        // slowest one before becoming visible.
        let firstSuccess: GenerationRecord | null = null
        let anyFailed = false
        const firstFailure = {
          current: null as {
            message: string
            code: GenerationErrorCode
          } | null,
        }

        const tasks = items.map(async (item) => {
          try {
            const result = await studioGenerateAPI({
              ...input,
              modelId: item.modelId,
              apiKeyId: item.apiKeyId,
              runGroupId,
              runGroupType: 'compare',
              runGroupIndex: item.index,
            })
            if (result.success && hasJobId(result.data)) {
              setStage('processing')
              const outcome = await pollImageJobForRunItem(
                result.data.jobId,
                item.id,
              )
              if (outcome.status === 'completed') {
                if (!firstSuccess) firstSuccess = outcome.generation
              } else if (outcome.status === 'failed') {
                anyFailed = true
                firstFailure.current ??= {
                  message: outcome.message,
                  code: outcome.code,
                }
              }
            } else {
              const failure = resolveGenerationError(
                result,
                tStudio('generateFailed'),
              )
              markActiveRunItemFailed(item.id, failure.message)
              anyFailed = true
              firstFailure.current ??= failure
            }
          } catch (error) {
            const failure = resolveGenerationError(
              {
                error:
                  error instanceof Error
                    ? error.message
                    : tStudio('generateFailed'),
              },
              tStudio('generateFailed'),
            )
            markActiveRunItemFailed(item.id, failure.message)
            anyFailed = true
            firstFailure.current ??= failure
          }
        })

        await Promise.allSettled(tasks)

        if (firstSuccess) {
          setLastGeneration(firstSuccess)
          notifySaved(firstSuccess, tStudio('compareSuccess'))
        } else if (anyFailed) {
          setError(firstFailure.current?.message ?? tStudio('generateFailed'))
          setErrorCode(firstFailure.current?.code ?? null)
        } else {
          // Every model is still generating on the worker — not a failure.
          toast.info(tStudio('stillProcessingHint'))
        }

        return firstSuccess
      } finally {
        stopTimer()
        setIsGenerating(false)
        setStage('idle')
      }
    },
    [
      tStudio,
      notifySaved,
      startTimer,
      stopTimer,
      pollImageJobForRunItem,
      markActiveRunItemFailed,
      resolveGenerationError,
    ],
  )

  // ── Audio generation (worker submit + polling) ────────────────

  const generateAudio = useCallback(
    async (input: AudioGenerateInput): Promise<GenerationRecord | null> => {
      setIsGenerating(true)
      setStage('generating')
      setError(null)
      setErrorCode(null)
      startTimer()

      const itemId = crypto.randomUUID()
      setActiveRun({
        id: crypto.randomUUID(),
        mode: 'single',
        items: [
          {
            id: itemId,
            modelId: input.modelId,
            status: 'generating',
            generation: null,
            error: null,
          },
        ],
        selectedItemId: itemId,
        prompt: input.freePrompt ?? '',
        startedAt: Date.now(),
      })

      try {
        const result = await generateAudioAPI({
          prompt: input.freePrompt ?? '',
          modelId: input.modelId,
          apiKeyId: input.apiKeyId,
          voiceId: input.voiceId,
          referenceAudioUrl: input.referenceAudioUrl,
          referenceText: input.referenceText,
          emotion: isAudioEmotion(input.emotion) ? input.emotion : undefined,
          pace: isAudioPace(input.pace) ? input.pace : undefined,
          pauseMarkers: input.pauseMarkers?.filter(isAudioPauseMarker),
          pronunciationDictionary: input.pronunciationDictionary,
          speed: input.speed,
          volume: input.volume,
          normalizeLoudness: input.normalizeLoudness,
          normalizeText: input.normalizeText,
          withTimestamps: input.withTimestamps,
          format: input.format,
          sampleRate: input.sampleRate,
          mp3Bitrate: input.mp3Bitrate,
          opusBitrate: input.opusBitrate,
          latency: input.latency,
          temperature: input.temperature,
          topP: input.topP,
          chunkLength: input.chunkLength,
          repetitionPenalty: input.repetitionPenalty,
          speakerVoiceIds: input.speakerVoiceIds,
        })

        if (result.success && hasJobId(result.data)) {
          const { jobId } = result.data
          setStage('queued')
          pollCountRef.current = 0

          return await new Promise<GenerationRecord | null>((resolve) => {
            pollRef.current = setInterval(async () => {
              pollCountRef.current += 1

              if (pollCountRef.current > AUDIO_GENERATION.MAX_POLL_ATTEMPTS) {
                const msg = tErrors('generation.provider_timeout')
                markActiveRunItemFailed(itemId, msg)
                finish(msg, GENERATION_ERROR_CODES.PROVIDER_TIMEOUT)
                resolve(null)
                return
              }

              try {
                const statusResponse = await checkAudioStatusAPI(jobId)

                if (!statusResponse.success || !statusResponse.data) {
                  const { message, code } = resolveGenerationError(
                    statusResponse,
                    tStudio('generateFailed'),
                  )
                  markActiveRunItemFailed(itemId, message)
                  finish(message, code)
                  resolve(null)
                  return
                }

                const statusData = statusResponse.data

                if (statusData.status === 'COMPLETED') {
                  const generation = statusData.generation
                  setLastGeneration(generation)
                  markActiveRunItemCompleted(itemId, generation)
                  finish()
                  notifySaved(generation, tStudio('generateSuccess'))
                  resolve(generation)
                  return
                }

                if (statusData.status === 'FAILED') {
                  const { message, code } = resolveGenerationError(
                    statusResponse,
                    tStudio('generateFailed'),
                  )
                  markActiveRunItemFailed(itemId, message)
                  finish(message, code)
                  resolve(null)
                  return
                }

                if (statusData.status === 'IN_QUEUE') {
                  setStage('queued')
                  return
                }

                if (statusData.status === 'IN_PROGRESS') {
                  setStage('processing')
                }
              } catch {
                const msg = tStudio('generateFailed')
                markActiveRunItemFailed(itemId, msg)
                finish(msg)
                resolve(null)
              }
            }, AUDIO_GENERATION.POLL_INTERVAL_MS)
          })
        }

        const { message, code } = resolveGenerationError(
          result,
          tStudio('generateFailed'),
        )
        setError(message)
        setErrorCode(code)
        markActiveRunItemFailed(itemId, message)
        return null
      } finally {
        stopTimer()
        setIsGenerating(false)
        setStage('idle')
      }
    },
    [
      tErrors,
      tStudio,
      notifySaved,
      startTimer,
      stopTimer,
      finish,
      markActiveRunItemCompleted,
      markActiveRunItemFailed,
      resolveGenerationError,
    ],
  )

  // ── Unified entry point ───────────────────────────────────────

  const generate = useCallback(
    async (input: UnifiedGenerateInput): Promise<GenerationRecord | null> => {
      lastRequestRef.current = input
      if (input.mode === 'image' && input.image) {
        const stack = loraStackRef.current
        const mergedAdvancedParams = mergeStackLoras(
          input.image.advancedParams,
          stack.toActiveLoras(),
          (assetId) =>
            stack.items.find((entry) => entry.asset.id === assetId)?.asset
              .loraUrl,
        )
        const image: StudioGenerateRequest =
          mergedAdvancedParams === input.image.advancedParams
            ? input.image
            : { ...input.image, advancedParams: mergedAdvancedParams }

        if (input.runMode === 'variant') {
          return generateVariants(image)
        }
        if (input.runMode === 'compare' && input.compareModels?.length) {
          return generateCompare(image, input.compareModels)
        }
        return generateImage(image)
      }
      if (input.mode === 'video' && input.video) {
        return generateVideo(input.video)
      }
      if (input.mode === 'audio' && input.audio) {
        return generateAudio(input.audio)
      }
      return null
    },
    [
      generateImage,
      generateVariants,
      generateCompare,
      generateVideo,
      generateAudio,
    ],
  )

  const retry = useCallback(async (): Promise<GenerationRecord | null> => {
    if (isGenerating || !lastRequestRef.current) {
      return null
    }

    return generate(lastRequestRef.current)
  }, [generate, isGenerating])

  const reset = useCallback(() => {
    setError(null)
    setErrorCode(null)
    setLastGeneration(null)
    setStage('idle')
    setElapsedSeconds(0)
    setActiveRun(null)
    lastRequestRef.current = null
    stopTimer()
    stopPolling()
  }, [stopTimer, stopPolling])

  return {
    isGenerating,
    stage,
    elapsedSeconds,
    error,
    errorCode,
    lastGeneration,
    generate,
    retry,
    reset,
    activeRun,
    selectWinner,
  }
}
