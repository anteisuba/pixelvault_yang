'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { AUDIO_GENERATION, VIDEO_GENERATION } from '@/constants/config'
import { VARIANT_COUNT, VARIANT_MAX_SEED } from '@/constants/studio'
import { getApiErrorMessage } from '@/lib/api-error-message'
import type {
  ActiveRun,
  GenerateAudioResponseData,
  GenerationRecord,
  RunGroupMode,
  RunItem,
  StudioGenerateRequest,
  VideoStatusResponseData,
  GenerateVideoRequest,
} from '@/types'
import {
  checkAudioStatusAPI,
  studioGenerateAPI,
  studioSelectWinnerAPI,
  submitVideoAPI,
  checkVideoStatusAPI,
  generateAudioAPI,
} from '@/lib/api-client'

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
  lastGeneration: GenerationRecord | null
  generate: (input: UnifiedGenerateInput) => Promise<GenerationRecord | null>
  retry: () => Promise<GenerationRecord | null>
  reset: () => void
  /** B0: Active generation run with per-item tracking */
  activeRun: ActiveRun | null
  /** B5: Select a variant as winner */
  selectWinner: (generationId: string) => Promise<void>
}

function hasGeneration(
  data:
    | GenerateAudioResponseData
    | VideoStatusResponseData
    | { generation?: GenerationRecord }
    | undefined,
): data is { generation: GenerationRecord } {
  return data?.generation != null
}

function hasJobId(
  data: GenerateAudioResponseData | undefined,
): data is Extract<GenerateAudioResponseData, { jobId: string }> {
  return typeof data?.jobId === 'string' && data.jobId.length > 0
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

// ─── Hook ────────────────────────────────────────────────────────

export function useUnifiedGenerate(): UseUnifiedGenerateReturn {
  const [isGenerating, setIsGenerating] = useState(false)
  const [stage, setStage] = useState<GenerationStage>('idle')
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [lastGeneration, setLastGeneration] = useState<GenerationRecord | null>(
    null,
  )
  const [activeRun, setActiveRun] = useState<ActiveRun | null>(null)

  const lastRequestRef = useRef<UnifiedGenerateInput | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollCountRef = useRef(0)

  const tStudio = useTranslations('StudioV2')
  const tVideo = useTranslations('VideoGenerate')
  const tErrors = useTranslations('Errors')

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
    (err?: string) => {
      stopPolling()
      stopTimer()
      setIsGenerating(false)
      setStage('idle')
      if (err) {
        setError(err)
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

  // ── Image generation (synchronous) ────────────────────────────

  const generateImage = useCallback(
    async (input: StudioGenerateRequest): Promise<GenerationRecord | null> => {
      setIsGenerating(true)
      setStage('generating')
      setError(null)
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
        if (result.success && hasGeneration(result.data)) {
          const generation = result.data.generation
          setError(null)
          setLastGeneration(generation)
          markActiveRunItemCompleted(itemId, generation)
          toast.success(tStudio('generateSuccess'))
          return generation
        }
        const msg = getApiErrorMessage(
          tErrors,
          result,
          tStudio('generateFailed'),
        )
        setError(msg)
        markActiveRunItemFailed(itemId, msg)
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
      startTimer,
      stopTimer,
      markActiveRunItemCompleted,
      markActiveRunItemFailed,
    ],
  )

  // ── Video generation (async queue + polling) ──────────────────

  const generateVideo = useCallback(
    async (params: GenerateVideoRequest): Promise<GenerationRecord | null> => {
      setIsGenerating(true)
      setError(null)
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
          const msg = submitResponse.error ?? tVideo('errorFallback')
          markActiveRunItemFailed(itemId, msg)
          finish(msg)
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
              finish(tVideo('errorTimeout'))
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
                const msg = statusResponse.error ?? tVideo('errorFallback')
                markActiveRunItemFailed(itemId, msg)
                finish(msg)
                resolve(null)
                return
              }

              const statusData = statusResponse.data

              if (statusData.status === 'COMPLETED') {
                const generation = statusData.generation
                setLastGeneration(generation)
                markActiveRunItemCompleted(itemId, generation)
                finish()
                toast.success(tVideo('toastSuccess'))
                resolve(generation)
                return
              }

              if (statusData.status === 'FAILED') {
                const msg = statusResponse.error ?? tVideo('errorFallback')
                markActiveRunItemFailed(itemId, msg)
                finish(msg)
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
        const results = await Promise.allSettled(
          items.map((item) =>
            studioGenerateAPI({
              ...input,
              seed: item.seed,
              runGroupId,
              runGroupType: 'variant',
              runGroupIndex: item.index,
            }),
          ),
        )

        let firstSuccess: GenerationRecord | null = null

        results.forEach((result, idx) => {
          const itemId = items[idx].id
          if (
            result.status === 'fulfilled' &&
            result.value.success &&
            hasGeneration(result.value.data)
          ) {
            const gen = result.value.data.generation
            if (!firstSuccess) firstSuccess = gen
            markActiveRunItemCompleted(itemId, gen)
          } else {
            const msg =
              result.status === 'fulfilled'
                ? getApiErrorMessage(
                    tErrors,
                    result.value,
                    tStudio('generateFailed'),
                  )
                : tStudio('generateFailed')
            markActiveRunItemFailed(itemId, msg)
          }
        })

        if (firstSuccess) {
          setLastGeneration(firstSuccess)
          toast.success(tStudio('variantSuccess'))
        } else {
          setError(tStudio('generateFailed'))
        }

        return firstSuccess
      } finally {
        stopTimer()
        setIsGenerating(false)
        setStage('idle')
      }
    },
    [
      tErrors,
      tStudio,
      startTimer,
      stopTimer,
      markActiveRunItemCompleted,
      markActiveRunItemFailed,
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
        const results = await Promise.allSettled(
          items.map((item) =>
            studioGenerateAPI({
              ...input,
              modelId: item.modelId,
              apiKeyId: item.apiKeyId,
              runGroupId,
              runGroupType: 'compare',
              runGroupIndex: item.index,
            }),
          ),
        )

        let firstSuccess: GenerationRecord | null = null

        results.forEach((result, idx) => {
          const itemId = items[idx].id
          if (
            result.status === 'fulfilled' &&
            result.value.success &&
            hasGeneration(result.value.data)
          ) {
            const gen = result.value.data.generation
            if (!firstSuccess) firstSuccess = gen
            markActiveRunItemCompleted(itemId, gen)
          } else {
            const msg =
              result.status === 'fulfilled'
                ? getApiErrorMessage(
                    tErrors,
                    result.value,
                    tStudio('generateFailed'),
                  )
                : tStudio('generateFailed')
            markActiveRunItemFailed(itemId, msg)
          }
        })

        if (firstSuccess) {
          setLastGeneration(firstSuccess)
          toast.success(tStudio('compareSuccess'))
        } else {
          setError(tStudio('generateFailed'))
        }

        return firstSuccess
      } finally {
        stopTimer()
        setIsGenerating(false)
        setStage('idle')
      }
    },
    [
      tErrors,
      tStudio,
      startTimer,
      stopTimer,
      markActiveRunItemCompleted,
      markActiveRunItemFailed,
    ],
  )

  // ── Audio generation (sync result or async submit + polling) ──

  const generateAudio = useCallback(
    async (input: AudioGenerateInput): Promise<GenerationRecord | null> => {
      setIsGenerating(true)
      setStage('generating')
      setError(null)
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
        })

        if (result.success && hasGeneration(result.data)) {
          const generation = result.data.generation
          setError(null)
          setLastGeneration(generation)
          markActiveRunItemCompleted(itemId, generation)
          toast.success(tStudio('generateSuccess'))
          return generation
        }

        if (result.success && hasJobId(result.data)) {
          const { jobId } = result.data
          setStage('queued')
          pollCountRef.current = 0

          return await new Promise<GenerationRecord | null>((resolve) => {
            pollRef.current = setInterval(async () => {
              pollCountRef.current += 1

              if (pollCountRef.current > AUDIO_GENERATION.MAX_POLL_ATTEMPTS) {
                const msg = tStudio('generateFailed')
                markActiveRunItemFailed(itemId, msg)
                finish(msg)
                resolve(null)
                return
              }

              try {
                const statusResponse = await checkAudioStatusAPI(jobId)

                if (!statusResponse.success || !statusResponse.data) {
                  const msg = statusResponse.error ?? tStudio('generateFailed')
                  markActiveRunItemFailed(itemId, msg)
                  finish(msg)
                  resolve(null)
                  return
                }

                const statusData = statusResponse.data

                if (statusData.status === 'COMPLETED') {
                  const generation = statusData.generation
                  setLastGeneration(generation)
                  markActiveRunItemCompleted(itemId, generation)
                  finish()
                  toast.success(tStudio('generateSuccess'))
                  resolve(generation)
                  return
                }

                if (statusData.status === 'FAILED') {
                  const msg = statusResponse.error ?? tStudio('generateFailed')
                  markActiveRunItemFailed(itemId, msg)
                  finish(msg)
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

        const msg = getApiErrorMessage(
          tErrors,
          result,
          tStudio('generateFailed'),
        )
        setError(msg)
        markActiveRunItemFailed(itemId, msg)
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
      startTimer,
      stopTimer,
      finish,
      markActiveRunItemCompleted,
      markActiveRunItemFailed,
    ],
  )

  // ── Unified entry point ───────────────────────────────────────

  const generate = useCallback(
    async (input: UnifiedGenerateInput): Promise<GenerationRecord | null> => {
      lastRequestRef.current = input
      if (input.mode === 'image' && input.image) {
        if (input.runMode === 'variant') {
          return generateVariants(input.image)
        }
        if (input.runMode === 'compare' && input.compareModels?.length) {
          return generateCompare(input.image, input.compareModels)
        }
        return generateImage(input.image)
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
    lastGeneration,
    generate,
    retry,
    reset,
    activeRun,
    selectWinner,
  }
}
