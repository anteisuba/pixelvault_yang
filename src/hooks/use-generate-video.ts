'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { VIDEO_GENERATION } from '@/constants/config'
import type { GenerateVideoRequest, GenerationRecord } from '@/types'
import { submitVideoAPI, checkVideoStatusAPI } from '@/lib/api-client'

type VideoGenerationStage = 'idle' | 'queued' | 'generating' | 'uploading'

interface UseGenerateVideoReturn {
  isGenerating: boolean
  stage: VideoGenerationStage
  elapsedSeconds: number
  error: string | null
  generatedGeneration: GenerationRecord | null
  generate: (params: GenerateVideoRequest) => Promise<void>
  reset: () => void
}

export function useGenerateVideo(): UseGenerateVideoReturn {
  const [isGenerating, setIsGenerating] = useState(false)
  const [stage, setStage] = useState<VideoGenerationStage>('idle')
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [generatedGeneration, setGeneratedGeneration] =
    useState<GenerationRecord | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollCountRef = useRef(0)
  const t = useTranslations('VideoGenerate')

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

  const generate = useCallback(
    async (params: GenerateVideoRequest) => {
      setIsGenerating(true)
      setError(null)
      setGeneratedGeneration(null)
      setStage('queued')
      startTimer()

      try {
        // Phase 1: Submit to queue
        const submitResponse = await submitVideoAPI(params)

        if (!submitResponse.success || !submitResponse.data) {
          finish(submitResponse.error ?? t('errorFallback'))
          return
        }

        const { jobId } = submitResponse.data
        setStage('generating')
        pollCountRef.current = 0

        // Phase 2: Poll for status
        pollRef.current = setInterval(async () => {
          pollCountRef.current += 1

          if (pollCountRef.current > VIDEO_GENERATION.MAX_POLL_ATTEMPTS) {
            finish(t('errorTimeout'))
            return
          }

          try {
            const statusResponse = await checkVideoStatusAPI(jobId)

            if (!statusResponse.success || !statusResponse.data) {
              // Tolerate early 404s — the job may not be in DB yet
              if (pollCountRef.current <= 5) return
              finish(statusResponse.error ?? t('errorFallback'))
              return
            }

            const { status, generation } = statusResponse.data

            if (status === 'COMPLETED' && generation) {
              setGeneratedGeneration(generation)
              finish()
              toast.success(t('toastSuccess'))
              return
            }

            if (status === 'FAILED') {
              finish(statusResponse.error ?? t('errorFallback'))
              return
            }

            // IN_QUEUE or IN_PROGRESS — keep polling
            if (status === 'IN_PROGRESS') {
              setStage('generating')
            }
          } catch {
            finish(t('errorUnexpected'))
          }
        }, VIDEO_GENERATION.POLL_INTERVAL_MS)
      } catch (err) {
        const message =
          err instanceof Error ? err.message : t('errorUnexpected')
        finish(message)
      }
    },
    [t, startTimer, finish],
  )

  const reset = useCallback(() => {
    setError(null)
    setGeneratedGeneration(null)
    setStage('idle')
    setElapsedSeconds(0)
    stopTimer()
    stopPolling()
  }, [stopTimer, stopPolling])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTimer()
      stopPolling()
    }
  }, [stopTimer, stopPolling])

  return {
    isGenerating,
    stage,
    elapsedSeconds,
    error,
    generatedGeneration,
    generate,
    reset,
  }
}
