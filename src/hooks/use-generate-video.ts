'use client'

import { useState, useCallback, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import type { GenerateVideoRequest, GenerationRecord } from '@/types'
import { generateVideoAPI } from '@/lib/api-client'

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
  const t = useTranslations('VideoGenerate')

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const startTimer = useCallback(() => {
    stopTimer()
    setElapsedSeconds(0)
    timerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1)
    }, 1000)
  }, [stopTimer])

  const generate = useCallback(
    async (params: GenerateVideoRequest) => {
      setIsGenerating(true)
      setError(null)
      setGeneratedGeneration(null)
      setStage('queued')
      startTimer()

      try {
        setStage('generating')
        const response = await generateVideoAPI(params)

        if (response.success && response.data) {
          setStage('uploading')
          setGeneratedGeneration(response.data.generation)
          setStage('idle')
          toast.success(t('toastSuccess'))
        } else {
          const msg = response.error ?? t('errorFallback')
          setError(msg)
          setStage('idle')
          toast.error(msg)
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : t('errorUnexpected')
        setError(message)
        setStage('idle')
        toast.error(message)
      } finally {
        setIsGenerating(false)
        stopTimer()
      }
    },
    [t, startTimer, stopTimer],
  )

  const reset = useCallback(() => {
    setError(null)
    setGeneratedGeneration(null)
    setStage('idle')
    setElapsedSeconds(0)
    stopTimer()
  }, [stopTimer])

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
