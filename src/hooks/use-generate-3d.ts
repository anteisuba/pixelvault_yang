'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { VIDEO_GENERATION } from '@/constants/config'
import type { Generate3DRequest, GenerationRecord } from '@/types'
import { submit3DAPI, check3DStatusAPI } from '@/lib/api-client'
import { getApiErrorMessage } from '@/lib/api-error-message'

type Model3DStage =
  | 'idle'
  | 'queued'
  | 'generating'
  | 'mesh'
  | 'texture'
  | 'uploading'

interface UploadProgress {
  loaded: number
  total: number
}

interface UseGenerate3DReturn {
  isGenerating: boolean
  stage: Model3DStage
  elapsedSeconds: number
  error: string | null
  previewModelUrl: string | null
  /**
   * PR2-B2: temporary fal GLB URL surfaced during the `uploading` stage so
   * the UI can render the finished mesh before R2 ingest completes. Cleared
   * once the COMPLETED status arrives with the permanent R2 URL.
   */
  provisionalModelUrl: string | null
  uploadProgress: UploadProgress | null
  generatedGeneration: GenerationRecord | null
  generate: (params: Generate3DRequest) => Promise<void>
  reset: () => void
}

/**
 * Image-to-3D generation hook. Mirrors `useGenerateVideo` — submit-then-poll
 * against the fal queue. The result is a GenerationRecord with `outputType:
 * 'MODEL_3D'`; the GLB URL lives on `record.modelUrl`, and `record.url` is
 * the poster PNG (uploaded by the client `<ModelViewer>` once the mesh
 * renders, see M3 work).
 */
export function useGenerate3D(): UseGenerate3DReturn {
  const [isGenerating, setIsGenerating] = useState(false)
  const [stage, setStage] = useState<Model3DStage>('idle')
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [previewModelUrl, setPreviewModelUrl] = useState<string | null>(null)
  const [provisionalModelUrl, setProvisionalModelUrl] = useState<string | null>(
    null,
  )
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(
    null,
  )
  const [generatedGeneration, setGeneratedGeneration] =
    useState<GenerationRecord | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollCountRef = useRef(0)
  const submitInFlightRef = useRef(false)
  // Skip a tick if the previous status request is still in-flight. fal's
  // 3D queue checks routinely take 5–15s on dev — without this guard, polls
  // stack up and saturate the connection pool.
  const inFlightRef = useRef(false)
  const t = useTranslations('Model3DGenerate')
  const tErrors = useTranslations('Errors')

  // Hunyuan3D and TripoSR routinely take 60–180s end-to-end. A 6s cadence
  // keeps the UI responsive without overlapping the typical 5–15s status
  // round-trip we see against fal.
  const POLL_INTERVAL_MS = 6000

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
      submitInFlightRef.current = false
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
    async (params: Generate3DRequest) => {
      if (submitInFlightRef.current) return
      submitInFlightRef.current = true
      setIsGenerating(true)
      setError(null)
      setPreviewModelUrl(null)
      setProvisionalModelUrl(null)
      setUploadProgress(null)
      setGeneratedGeneration(null)
      setStage('queued')
      startTimer()

      try {
        const submitResponse = await submit3DAPI(params)

        if (!submitResponse.success || !submitResponse.data) {
          finish(
            getApiErrorMessage(tErrors, submitResponse, t('errorFallback')),
          )
          return
        }

        const { jobId } = submitResponse.data
        setStage('generating')
        pollCountRef.current = 0

        pollRef.current = setInterval(async () => {
          // Skip when the previous request hasn't returned — prevents polls
          // from stacking up when fal status checks are slow.
          if (inFlightRef.current) return

          pollCountRef.current += 1

          if (pollCountRef.current > VIDEO_GENERATION.MAX_POLL_ATTEMPTS) {
            finish(t('errorTimeout'))
            return
          }

          inFlightRef.current = true
          try {
            const statusResponse = await check3DStatusAPI(jobId)

            if (!statusResponse.success || !statusResponse.data) {
              if (pollCountRef.current <= 5) return
              finish(
                getApiErrorMessage(tErrors, statusResponse, t('errorFallback')),
              )
              return
            }

            const { status, generation, previewModelUrl, stage } =
              statusResponse.data
            // Discriminated union — provisional fields live on the
            // IN_QUEUE/IN_PROGRESS branch only. The narrow has to stay
            // inline in the ternary; TS doesn't propagate it through a
            // boolean variable.
            const provisional =
              statusResponse.data.status === 'IN_QUEUE' ||
              statusResponse.data.status === 'IN_PROGRESS'
                ? statusResponse.data.provisionalModelUrl
                : undefined
            const progress =
              statusResponse.data.status === 'IN_QUEUE' ||
              statusResponse.data.status === 'IN_PROGRESS'
                ? statusResponse.data.uploadProgress
                : undefined

            if (previewModelUrl) {
              setPreviewModelUrl(previewModelUrl)
            }
            if (provisional) {
              setProvisionalModelUrl(provisional)
            }
            setUploadProgress(progress ?? null)
            if (stage === 'mesh') {
              setStage('mesh')
            }
            if (stage === 'texture') {
              setStage('texture')
            }
            if (stage === 'uploading') {
              setStage('uploading')
            }

            if (status === 'COMPLETED' && generation) {
              setGeneratedGeneration(generation)
              setProvisionalModelUrl(null)
              setUploadProgress(null)
              finish()
              toast.success(t('toastSuccess'))
              return
            }

            if (status === 'FAILED') {
              finish(
                getApiErrorMessage(tErrors, statusResponse, t('errorFallback')),
              )
              return
            }

            if (status === 'IN_PROGRESS') {
              setStage(stage ?? 'generating')
            }
          } catch {
            finish(t('errorUnexpected'))
          } finally {
            inFlightRef.current = false
          }
        }, POLL_INTERVAL_MS)
      } catch (err) {
        const message =
          err instanceof Error ? err.message : t('errorUnexpected')
        finish(message)
      }
    },
    [t, tErrors, startTimer, finish],
  )

  const reset = useCallback(() => {
    submitInFlightRef.current = false
    setError(null)
    setPreviewModelUrl(null)
    setProvisionalModelUrl(null)
    setUploadProgress(null)
    setGeneratedGeneration(null)
    setStage('idle')
    setElapsedSeconds(0)
    stopTimer()
    stopPolling()
  }, [stopTimer, stopPolling])

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
    previewModelUrl,
    provisionalModelUrl,
    uploadProgress,
    generatedGeneration,
    generate,
    reset,
  }
}
