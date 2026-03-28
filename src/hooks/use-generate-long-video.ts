'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { VIDEO_GENERATION } from '@/constants/config'
import type {
  LongVideoRequest,
  GenerationRecord,
  PipelineStatusRecord,
  PipelineClipRecord,
} from '@/types'
import {
  submitLongVideoAPI,
  checkLongVideoStatusAPI,
  retryLongVideoClipAPI,
  cancelLongVideoAPI,
} from '@/lib/api-client'

type LongVideoStage =
  | 'idle'
  | 'submitting'
  | 'generating'
  | 'completed'
  | 'failed'

interface UseGenerateLongVideoReturn {
  isGenerating: boolean
  stage: LongVideoStage
  elapsedSeconds: number
  error: string | null

  // Pipeline progress
  pipelineStatus: PipelineStatusRecord | null
  currentClipIndex: number
  totalClips: number
  completedClips: number
  clipPreviews: PipelineClipRecord[]

  // Final result
  generatedGeneration: GenerationRecord | null

  // Actions
  generate: (params: LongVideoRequest) => Promise<void>
  retryClip: (clipIndex: number) => Promise<void>
  cancel: () => Promise<void>
  reset: () => void
}

export function useGenerateLongVideo(): UseGenerateLongVideoReturn {
  const [isGenerating, setIsGenerating] = useState(false)
  const [stage, setStage] = useState<LongVideoStage>('idle')
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [pipelineStatus, setPipelineStatus] =
    useState<PipelineStatusRecord | null>(null)
  const [generatedGeneration, setGeneratedGeneration] =
    useState<GenerationRecord | null>(null)

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollCountRef = useRef(0)
  const pipelineIdRef = useRef<string | null>(null)
  const t = useTranslations('LongVideo')

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
      if (err) {
        setStage('failed')
        setError(err)
        toast.error(err)
      }
    },
    [stopPolling, stopTimer],
  )

  const startPolling = useCallback(
    (pipelineId: string) => {
      stopPolling()
      pollCountRef.current = 0

      pollRef.current = setInterval(async () => {
        pollCountRef.current += 1

        if (
          pollCountRef.current > VIDEO_GENERATION.MAX_PIPELINE_POLL_ATTEMPTS
        ) {
          finish(t('errorTimeout'))
          return
        }

        try {
          const statusResponse = await checkLongVideoStatusAPI(pipelineId)

          if (!statusResponse.success || !statusResponse.data) {
            if (pollCountRef.current <= 5) return
            finish(statusResponse.error ?? t('errorFallback'))
            return
          }

          const data = statusResponse.data
          setPipelineStatus(data)

          if (data.status === 'COMPLETED' && data.generation) {
            setGeneratedGeneration(data.generation)
            setStage('completed')
            finish()
            toast.success(
              t('pipelineComplete', {
                duration: Math.round(data.currentDurationSec),
              }),
            )
            return
          }

          if (data.status === 'FAILED' || data.status === 'CANCELLED') {
            finish(data.errorMessage ?? t('errorFallback'))
            return
          }

          // Still running
          setStage('generating')
        } catch {
          finish(t('errorFallback'))
        }
      }, VIDEO_GENERATION.PIPELINE_POLL_INTERVAL_MS)
    },
    [stopPolling, finish, t],
  )

  const generate = useCallback(
    async (params: LongVideoRequest) => {
      setIsGenerating(true)
      setError(null)
      setGeneratedGeneration(null)
      setPipelineStatus(null)
      setStage('submitting')
      startTimer()

      try {
        const submitResponse = await submitLongVideoAPI(params)

        if (!submitResponse.success || !submitResponse.data) {
          finish(submitResponse.error ?? t('errorFallback'))
          return
        }

        const { pipelineId } = submitResponse.data
        pipelineIdRef.current = pipelineId
        setStage('generating')

        // Start polling
        startPolling(pipelineId)
      } catch (err) {
        const message = err instanceof Error ? err.message : t('errorFallback')
        finish(message)
      }
    },
    [t, startTimer, finish, startPolling],
  )

  const retryClip = useCallback(
    async (clipIndex: number) => {
      if (!pipelineIdRef.current) return

      setError(null)
      setIsGenerating(true)
      setStage('generating')
      startTimer()

      try {
        const response = await retryLongVideoClipAPI(
          pipelineIdRef.current,
          clipIndex,
        )

        if (!response.success || !response.data) {
          finish(response.error ?? t('errorFallback'))
          return
        }

        setPipelineStatus(response.data)
        startPolling(pipelineIdRef.current)
      } catch (err) {
        const message = err instanceof Error ? err.message : t('errorFallback')
        finish(message)
      }
    },
    [t, startTimer, finish, startPolling],
  )

  const cancel = useCallback(async () => {
    if (!pipelineIdRef.current) return

    try {
      const response = await cancelLongVideoAPI(pipelineIdRef.current)

      if (response.success && response.data) {
        setPipelineStatus(response.data)
      }

      finish()
      setStage('idle')
      toast.info(t('cancel'))
    } catch {
      // Best effort
    }
  }, [finish, t])

  const reset = useCallback(() => {
    setError(null)
    setGeneratedGeneration(null)
    setPipelineStatus(null)
    setStage('idle')
    setElapsedSeconds(0)
    pipelineIdRef.current = null
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

  // Derived state
  const completedClips = pipelineStatus?.completedClips ?? 0
  const totalClips = pipelineStatus?.totalClips ?? 0
  const currentClipIndex =
    completedClips < totalClips ? completedClips : totalClips - 1
  const clipPreviews =
    pipelineStatus?.clips.filter((c) => c.status === 'COMPLETED') ?? []

  return {
    isGenerating,
    stage,
    elapsedSeconds,
    error,
    pipelineStatus,
    currentClipIndex,
    totalClips,
    completedClips,
    clipPreviews,
    generatedGeneration,
    generate,
    retryClip,
    cancel,
    reset,
  }
}
