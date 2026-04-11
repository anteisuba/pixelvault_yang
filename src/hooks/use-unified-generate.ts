'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { VIDEO_GENERATION } from '@/constants/config'
import { VARIANT_COUNT, VARIANT_MAX_SEED } from '@/constants/studio'
import { getApiErrorMessage } from '@/lib/api-error-message'
import type {
  ActiveRun,
  GenerationRecord,
  RunGroupMode,
  StudioGenerateRequest,
  GenerateVideoRequest,
} from '@/types'
import {
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
        if (result.success && result.data?.generation) {
          setError(null)
          setLastGeneration(result.data.generation)
          setActiveRun((prev) =>
            prev
              ? {
                  ...prev,
                  items: prev.items.map((item) =>
                    item.id === itemId
                      ? {
                          ...item,
                          status: 'completed' as const,
                          generation: result.data!.generation,
                        }
                      : item,
                  ),
                }
              : null,
          )
          toast.success(tStudio('generateSuccess'))
          return result.data.generation
        }
        const msg = getApiErrorMessage(
          tErrors,
          result,
          tStudio('generateFailed'),
        )
        setError(msg)
        setActiveRun((prev) =>
          prev
            ? {
                ...prev,
                items: prev.items.map((item) =>
                  item.id === itemId
                    ? { ...item, status: 'failed' as const, error: msg }
                    : item,
                ),
              }
            : null,
        )
        return null
      } finally {
        stopTimer()
        setIsGenerating(false)
        setStage('idle')
      }
    },
    [tErrors, tStudio, startTimer, stopTimer],
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
          setActiveRun((prev) =>
            prev
              ? {
                  ...prev,
                  items: prev.items.map((item) =>
                    item.id === itemId
                      ? { ...item, status: 'failed' as const, error: msg }
                      : item,
                  ),
                }
              : null,
          )
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
              setActiveRun((prev) =>
                prev
                  ? {
                      ...prev,
                      items: prev.items.map((item) =>
                        item.id === itemId
                          ? {
                              ...item,
                              status: 'failed' as const,
                              error: tVideo('errorTimeout'),
                            }
                          : item,
                      ),
                    }
                  : null,
              )
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
                setActiveRun((prev) =>
                  prev
                    ? {
                        ...prev,
                        items: prev.items.map((item) =>
                          item.id === itemId
                            ? {
                                ...item,
                                status: 'failed' as const,
                                error: msg,
                              }
                            : item,
                        ),
                      }
                    : null,
                )
                finish(msg)
                resolve(null)
                return
              }

              const { status, generation } = statusResponse.data

              if (status === 'COMPLETED' && generation) {
                setLastGeneration(generation)
                setActiveRun((prev) =>
                  prev
                    ? {
                        ...prev,
                        items: prev.items.map((item) =>
                          item.id === itemId
                            ? {
                                ...item,
                                status: 'completed' as const,
                                generation,
                              }
                            : item,
                        ),
                      }
                    : null,
                )
                finish()
                toast.success(tVideo('toastSuccess'))
                resolve(generation)
                return
              }

              if (status === 'FAILED') {
                const msg = statusResponse.error ?? tVideo('errorFallback')
                setActiveRun((prev) =>
                  prev
                    ? {
                        ...prev,
                        items: prev.items.map((item) =>
                          item.id === itemId
                            ? {
                                ...item,
                                status: 'failed' as const,
                                error: msg,
                              }
                            : item,
                        ),
                      }
                    : null,
                )
                finish(msg)
                resolve(null)
                return
              }

              if (status === 'IN_PROGRESS') {
                setStage('processing')
              }
            } catch {
              setActiveRun((prev) =>
                prev
                  ? {
                      ...prev,
                      items: prev.items.map((item) =>
                        item.id === itemId
                          ? {
                              ...item,
                              status: 'failed' as const,
                              error: tVideo('errorUnexpected'),
                            }
                          : item,
                      ),
                    }
                  : null,
              )
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
    [tVideo, startTimer, finish],
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
            result.value.data?.generation
          ) {
            const gen = result.value.data.generation
            if (!firstSuccess) firstSuccess = gen
            setActiveRun((prev) =>
              prev
                ? {
                    ...prev,
                    items: prev.items.map((item) =>
                      item.id === itemId
                        ? {
                            ...item,
                            status: 'completed' as const,
                            generation: gen,
                          }
                        : item,
                    ),
                  }
                : null,
            )
          } else {
            const msg =
              result.status === 'fulfilled'
                ? getApiErrorMessage(
                    tErrors,
                    result.value,
                    tStudio('generateFailed'),
                  )
                : tStudio('generateFailed')
            setActiveRun((prev) =>
              prev
                ? {
                    ...prev,
                    items: prev.items.map((item) =>
                      item.id === itemId
                        ? {
                            ...item,
                            status: 'failed' as const,
                            error: msg,
                          }
                        : item,
                    ),
                  }
                : null,
            )
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
    [tErrors, tStudio, startTimer, stopTimer],
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
            result.value.data?.generation
          ) {
            const gen = result.value.data.generation
            if (!firstSuccess) firstSuccess = gen
            setActiveRun((prev) =>
              prev
                ? {
                    ...prev,
                    items: prev.items.map((item) =>
                      item.id === itemId
                        ? {
                            ...item,
                            status: 'completed' as const,
                            generation: gen,
                          }
                        : item,
                    ),
                  }
                : null,
            )
          } else {
            const msg =
              result.status === 'fulfilled'
                ? getApiErrorMessage(
                    tErrors,
                    result.value,
                    tStudio('generateFailed'),
                  )
                : tStudio('generateFailed')
            setActiveRun((prev) =>
              prev
                ? {
                    ...prev,
                    items: prev.items.map((item) =>
                      item.id === itemId
                        ? {
                            ...item,
                            status: 'failed' as const,
                            error: msg,
                          }
                        : item,
                    ),
                  }
                : null,
            )
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
    [tErrors, tStudio, startTimer, stopTimer],
  )

  // ── Audio generation (synchronous — Fish Audio) ────────────────

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
        })
        if (result.success && result.data?.generation) {
          setError(null)
          setLastGeneration(result.data.generation)
          setActiveRun((prev) =>
            prev
              ? {
                  ...prev,
                  items: prev.items.map((item) =>
                    item.id === itemId
                      ? {
                          ...item,
                          status: 'completed' as const,
                          generation: result.data!.generation,
                        }
                      : item,
                  ),
                }
              : null,
          )
          toast.success(tStudio('generateSuccess'))
          return result.data.generation
        }
        const msg = getApiErrorMessage(
          tErrors,
          result,
          tStudio('generateFailed'),
        )
        setError(msg)
        setActiveRun((prev) =>
          prev
            ? {
                ...prev,
                items: prev.items.map((item) =>
                  item.id === itemId
                    ? { ...item, status: 'failed' as const, error: msg }
                    : item,
                ),
              }
            : null,
        )
        return null
      } finally {
        stopTimer()
        setIsGenerating(false)
        setStage('idle')
      }
    },
    [tErrors, tStudio, startTimer, stopTimer],
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
