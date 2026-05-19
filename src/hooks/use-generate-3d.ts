'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { VIDEO_GENERATION } from '@/constants/config'
import type {
  Generate3DRequest,
  GenerationRecord,
  RetryMesh3DRequest,
} from '@/types'
import {
  cancel3DAPI,
  check3DStatusAPI,
  continue3DAPI,
  retryMesh3DAPI,
  submit3DAPI,
} from '@/lib/api-client'
import { getApiErrorMessage } from '@/lib/api-error-message'

type Model3DStage =
  | 'idle'
  | 'queued'
  | 'generating'
  | 'mesh'
  | 'mesh_ready'
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
  /**
   * PR3-α: active job ID, exposed so the UI can drive the staged actions
   * (continue / retry-mesh / cancel) without threading it through props.
   * `null` outside of an active run.
   */
  jobId: string | null
  generate: (params: Generate3DRequest) => Promise<void>
  /** PR3-α: kick off Stage 2 from MESH_READY. */
  continueRun: (options?: { seed?: number }) => Promise<void>
  /** PR3-α: re-submit Stage 1 with optional new seed / multi-view / faces. */
  retryMesh: (options?: Omit<RetryMesh3DRequest, 'jobId'>) => Promise<void>
  /** PR3-α: abort the current job. Silent — no error toast. */
  cancelRun: () => Promise<void>
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
  const [jobId, setJobId] = useState<string | null>(null)
  // Mirror of `jobId` for the polling callback — useCallback captures stale
  // state otherwise. The setState is for UI consumers; the ref is for the
  // staged-mode actions to dispatch against the active job.
  const jobIdRef = useRef<string | null>(null)
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
      jobIdRef.current = null
      setJobId(null)
      if (err) {
        setError(err)
        toast.error(err)
      }
    },
    [stopPolling, stopTimer],
  )

  // PR3-α: polling loop extracted so generate() + continueRun() + retryMesh()
  // can all share it. Handles every stage transition and terminal states
  // (COMPLETED, FAILED, cancelled-FAILED, MESH_READY pause).
  const startPolling = useCallback(
    (activeJobId: string) => {
      stopPolling()
      pollCountRef.current = 0
      inFlightRef.current = false

      pollRef.current = setInterval(async () => {
        if (inFlightRef.current) return

        pollCountRef.current += 1

        if (pollCountRef.current > VIDEO_GENERATION.MAX_POLL_ATTEMPTS) {
          finish(t('errorTimeout'))
          return
        }

        inFlightRef.current = true
        try {
          const statusResponse = await check3DStatusAPI(activeJobId)

          if (!statusResponse.success || !statusResponse.data) {
            if (pollCountRef.current <= 5) return
            finish(
              getApiErrorMessage(tErrors, statusResponse, t('errorFallback')),
            )
            return
          }

          const { status, generation, previewModelUrl, stage } =
            statusResponse.data
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
            // PR3-α: user-initiated cancel surfaces as FAILED + cancelled.
            // Treat it like a clean termination (no error toast).
            const cancelled =
              statusResponse.data.status === 'FAILED' &&
              statusResponse.data.cancelled === true
            if (cancelled) {
              finish()
              return
            }
            finish(
              getApiErrorMessage(tErrors, statusResponse, t('errorFallback')),
            )
            return
          }

          if (status === 'IN_PROGRESS') {
            // PR3-α: staged-mode park. Stop polling — the next state change
            // is driven by the user calling continue / retryMesh / cancel.
            if (stage === 'mesh_ready') {
              setStage('mesh_ready')
              stopPolling()
              return
            }
            setStage(stage ?? 'generating')
          }
        } catch {
          finish(t('errorUnexpected'))
        } finally {
          inFlightRef.current = false
        }
      }, POLL_INTERVAL_MS)
    },
    [finish, stopPolling, t, tErrors],
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

        const newJobId = submitResponse.data.jobId
        jobIdRef.current = newJobId
        setJobId(newJobId)
        setStage('generating')
        startPolling(newJobId)
      } catch (err) {
        const message =
          err instanceof Error ? err.message : t('errorUnexpected')
        finish(message)
      }
    },
    [t, tErrors, startTimer, finish, startPolling],
  )

  // PR3-α: dispatch Stage 2 against the active staged job. The server
  // validates state, so this is a no-op when the job isn't parked at
  // MESH_READY.
  const continueRun = useCallback(
    async (options?: { seed?: number }) => {
      const activeJobId = jobIdRef.current
      if (!activeJobId) return
      const response = await continue3DAPI({
        jobId: activeJobId,
        ...(options?.seed != null && { seed: options.seed }),
      })
      if (!response.success || !response.data) {
        finish(getApiErrorMessage(tErrors, response, t('errorFallback')))
        return
      }
      setStage('texture')
      startPolling(activeJobId)
    },
    [finish, startPolling, t, tErrors],
  )

  // PR3-α: re-submit Stage 1 (Geometry). Forwards optional overrides for
  // seed / multi-view / face count so the diagnosis dock can act on the
  // user's selected reason.
  const retryMesh = useCallback(
    async (options?: Omit<RetryMesh3DRequest, 'jobId'>) => {
      const activeJobId = jobIdRef.current
      if (!activeJobId) return
      const response = await retryMesh3DAPI({
        jobId: activeJobId,
        ...options,
      })
      if (!response.success || !response.data) {
        finish(getApiErrorMessage(tErrors, response, t('errorFallback')))
        return
      }
      setStage('mesh')
      setPreviewModelUrl(null)
      startPolling(activeJobId)
    },
    [finish, startPolling, t, tErrors],
  )

  // PR3-α: silent abort — the server marks the job FAILED + cancelled, but
  // the hook just calls finish() without an error toast.
  const cancelRun = useCallback(async () => {
    const activeJobId = jobIdRef.current
    if (!activeJobId) {
      finish()
      return
    }
    await cancel3DAPI({ jobId: activeJobId })
    finish()
  }, [finish])

  const reset = useCallback(() => {
    submitInFlightRef.current = false
    setError(null)
    setPreviewModelUrl(null)
    setProvisionalModelUrl(null)
    setUploadProgress(null)
    setGeneratedGeneration(null)
    setStage('idle')
    setElapsedSeconds(0)
    jobIdRef.current = null
    setJobId(null)
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
    jobId,
    generate,
    continueRun,
    retryMesh,
    cancelRun,
    reset,
  }
}
