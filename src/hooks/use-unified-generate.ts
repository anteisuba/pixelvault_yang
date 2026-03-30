'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { VIDEO_GENERATION } from '@/constants/config'
import type {
  GenerationRecord,
  StudioGenerateRequest,
  GenerateVideoRequest,
} from '@/types'
import {
  studioGenerateAPI,
  submitVideoAPI,
  checkVideoStatusAPI,
} from '@/lib/api-client'

// ─── Types ───────────────────────────────────────────────────────

export type GenerationStage =
  | 'idle'
  | 'generating'
  | 'queued'
  | 'processing'
  | 'uploading'

export type GenerationMode = 'image' | 'video'

export interface UnifiedGenerateInput {
  mode: GenerationMode
  image?: StudioGenerateRequest
  video?: GenerateVideoRequest
}

export interface UseUnifiedGenerateReturn {
  isGenerating: boolean
  stage: GenerationStage
  elapsedSeconds: number
  error: string | null
  lastGeneration: GenerationRecord | null
  generate: (input: UnifiedGenerateInput) => Promise<GenerationRecord | null>
  reset: () => void
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

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollCountRef = useRef(0)

  const tStudio = useTranslations('StudioV2')
  const tVideo = useTranslations('VideoGenerate')

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
      try {
        const result = await studioGenerateAPI(input)
        if (result.success && result.data?.generation) {
          setLastGeneration(result.data.generation)
          toast.success(tStudio('generateSuccess'))
          return result.data.generation
        }
        const msg = result.error ?? tStudio('generateFailed')
        setError(msg)
        toast.error(msg)
        return null
      } finally {
        setIsGenerating(false)
        setStage('idle')
      }
    },
    [tStudio],
  )

  // ── Video generation (async queue + polling) ──────────────────

  const generateVideo = useCallback(
    async (params: GenerateVideoRequest): Promise<GenerationRecord | null> => {
      setIsGenerating(true)
      setError(null)
      setStage('queued')
      startTimer()

      try {
        const submitResponse = await submitVideoAPI(params)
        if (!submitResponse.success || !submitResponse.data) {
          finish(submitResponse.error ?? tVideo('errorFallback'))
          return null
        }

        const { jobId } = submitResponse.data
        setStage('processing')
        pollCountRef.current = 0

        return await new Promise<GenerationRecord | null>((resolve) => {
          pollRef.current = setInterval(async () => {
            pollCountRef.current += 1

            if (pollCountRef.current > VIDEO_GENERATION.MAX_POLL_ATTEMPTS) {
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
                finish(statusResponse.error ?? tVideo('errorFallback'))
                resolve(null)
                return
              }

              const { status, generation } = statusResponse.data

              if (status === 'COMPLETED' && generation) {
                setLastGeneration(generation)
                finish()
                toast.success(tVideo('toastSuccess'))
                resolve(generation)
                return
              }

              if (status === 'FAILED') {
                finish(statusResponse.error ?? tVideo('errorFallback'))
                resolve(null)
                return
              }

              if (status === 'IN_PROGRESS') {
                setStage('processing')
              }
            } catch {
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

  // ── Unified entry point ───────────────────────────────────────

  const generate = useCallback(
    async (input: UnifiedGenerateInput): Promise<GenerationRecord | null> => {
      if (input.mode === 'image' && input.image) {
        return generateImage(input.image)
      }
      if (input.mode === 'video' && input.video) {
        return generateVideo(input.video)
      }
      return null
    },
    [generateImage, generateVideo],
  )

  const reset = useCallback(() => {
    setError(null)
    setLastGeneration(null)
    setStage('idle')
    setElapsedSeconds(0)
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
    reset,
  }
}
