'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { deferEffectTask } from '@/lib/defer-effect-task'
import type {
  LoraTrainingRecord,
  LoraTrainingSubmitErrorCode,
  SubmitLoraTrainingRequest,
} from '@/types'
import {
  submitLoraTrainingAPI,
  listLoraTrainingJobsAPI,
  getLoraTrainingStatusAPI,
  uploadLoraTrainingImageAPI,
  type LoraTrainingSubmitFailure,
} from '@/lib/api-client'
import { LORA_TRAINING } from '@/constants/config'

export interface SubmitOutcome {
  job: LoraTrainingRecord | null
  errorCode?: LoraTrainingSubmitErrorCode
  errorFieldKey?: string
  errorMessage?: string
}

export interface UploadedTrainingImageEntry {
  url: string
  filename: string
  storageKey: string
}

export interface FailedTrainingImageEntry {
  id: string
  filename: string
  error: string
  file: File
}

export interface UseLoraTrainingReturn {
  jobs: LoraTrainingRecord[]
  isLoading: boolean
  isSubmitting: boolean
  submit: (data: SubmitLoraTrainingRequest) => Promise<SubmitOutcome>
  refresh: () => Promise<void>
  activePollingJobId: string | null
  uploaded: UploadedTrainingImageEntry[]
  failed: FailedTrainingImageEntry[]
  uploadsInFlight: number
  uploadImages: (files: File[]) => Promise<void>
  retryFailedUpload: (id: string) => Promise<void>
  removeUploaded: (url: string) => void
  reorderUploaded: (fromUrl: string, toUrl: string) => void
  setCoverUploaded: (url: string) => void
  clearImages: () => void
  dismissFailed: (id: string) => void
  adoptExistingUrls: (urls: string[]) => void
  imageUrls: string[]
}

const FAILED_ID_PREFIX = 'failed-'

let failedSeq = 0

/**
 * Generate a stable id for a failed entry. Crypto random would be overkill;
 * a process-local counter is fine for in-memory list keys.
 */
function nextFailedId() {
  failedSeq += 1
  return `${FAILED_ID_PREFIX}${Date.now()}-${failedSeq}`
}

export function useLoraTraining(): UseLoraTrainingReturn {
  const [jobs, setJobs] = useState<LoraTrainingRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activePollingJobId, setActivePollingJobId] = useState<string | null>(
    null,
  )
  const [uploaded, setUploaded] = useState<UploadedTrainingImageEntry[]>([])
  const [failed, setFailed] = useState<FailedTrainingImageEntry[]>([])
  const [uploadsInFlight, setUploadsInFlight] = useState(0)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const t = useTranslations('Toasts')
  const tErr = useTranslations('LoraTraining')

  // ─── Load jobs ──────────────────────────────────────────────────

  const fetchJobs = useCallback(async () => {
    setIsLoading(true)
    const response = await listLoraTrainingJobsAPI()
    if (response.success && response.data) {
      setJobs(response.data)
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    return deferEffectTask(() => {
      void fetchJobs()
    })
  }, [fetchJobs])

  // ─── Polling ────────────────────────────────────────────────────

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
    setActivePollingJobId(null)
  }, [])

  const startPolling = useCallback(
    (jobId: string) => {
      stopPolling()
      setActivePollingJobId(jobId)

      pollingRef.current = setInterval(async () => {
        const response = await getLoraTrainingStatusAPI(jobId)
        if (!response.success || !response.data) return

        const updated = response.data

        // Update job in list
        setJobs((prev) => prev.map((j) => (j.id === jobId ? updated : j)))

        // Check terminal states
        if (
          updated.status === 'COMPLETED' ||
          updated.status === 'FAILED' ||
          updated.status === 'CANCELED'
        ) {
          stopPolling()
          if (updated.status === 'COMPLETED') {
            toast.success(t('loraTrainingComplete'))
          } else if (updated.status === 'FAILED') {
            toast.error(updated.errorMessage ?? t('loraTrainingFailed'))
          }
        }
      }, LORA_TRAINING.POLL_INTERVAL_MS)
    },
    [stopPolling, t],
  )

  // Cleanup on unmount
  useEffect(() => {
    return () => stopPolling()
  }, [stopPolling])

  // Auto-poll any in-progress job on load
  const pendingJobId = jobs.find(
    (j) => j.status === 'QUEUED' || j.status === 'TRAINING',
  )?.id
  useEffect(() => {
    if (pendingJobId && !activePollingJobId) {
      return deferEffectTask(() => {
        startPolling(pendingJobId)
      })
    }
  }, [pendingJobId, activePollingJobId, startPolling])

  // ─── Image upload (partial-failure aware) ───────────────────────

  /**
   * Upload one batch of files. Each file is uploaded in parallel; on
   * settlement the successful ones land in `uploaded`, the failed ones
   * land in `failed` with their original File ref so the user can hit
   * "retry" on a single tile without re-picking from the OS dialog.
   *
   * Caps against MAX_IMAGES using both the current `uploaded` count and
   * the in-flight counter — a user mashing the picker can't blow past
   * the limit just because two batches landed in the same tick.
   */
  const uploadImages = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return

      const slotsLeft =
        LORA_TRAINING.MAX_IMAGES - uploaded.length - uploadsInFlight
      if (slotsLeft <= 0) {
        toast.warning(
          tErr('uploadMaxReached', { max: LORA_TRAINING.MAX_IMAGES }),
        )
        return
      }
      const batch = files.slice(0, slotsLeft)
      setUploadsInFlight((n) => n + batch.length)

      const results = await Promise.all(
        batch.map(async (file) => ({
          file,
          result: await uploadLoraTrainingImageAPI(file),
        })),
      )

      setUploadsInFlight((n) => n - batch.length)

      const newUploaded: UploadedTrainingImageEntry[] = []
      const newFailed: FailedTrainingImageEntry[] = []
      for (const { file, result } of results) {
        if (result.success && result.data) {
          newUploaded.push({
            url: result.data.url,
            storageKey: result.data.storageKey,
            filename: file.name,
          })
        } else {
          newFailed.push({
            id: nextFailedId(),
            filename: file.name,
            error: result.error ?? tErr('uploadFailed'),
            file,
          })
        }
      }

      if (newUploaded.length > 0) {
        setUploaded((prev) => {
          const seen = new Set(prev.map((e) => e.url))
          const room = LORA_TRAINING.MAX_IMAGES - prev.length
          const fresh = newUploaded.filter((e) => !seen.has(e.url))
          return [...prev, ...fresh.slice(0, room)]
        })
      }
      if (newFailed.length > 0) {
        setFailed((prev) => [...prev, ...newFailed])
      }
    },
    [uploaded.length, uploadsInFlight, tErr],
  )

  /**
   * Re-upload a single failed entry. Removes it from `failed` on success;
   * leaves it (updated error) on repeat failure. Doesn't bump the upload
   * cap check because we're replacing a slot we already tried to use.
   */
  const retryFailedUpload = useCallback(
    async (id: string) => {
      const entry = failed.find((f) => f.id === id)
      if (!entry) return

      setUploadsInFlight((n) => n + 1)
      const result = await uploadLoraTrainingImageAPI(entry.file)
      setUploadsInFlight((n) => n - 1)

      if (result.success && result.data) {
        const data = result.data
        setUploaded((prev) => {
          if (prev.some((e) => e.url === data.url)) return prev
          return [
            ...prev,
            {
              url: data.url,
              storageKey: data.storageKey,
              filename: entry.filename,
            },
          ]
        })
        setFailed((prev) => prev.filter((f) => f.id !== id))
      } else {
        setFailed((prev) =>
          prev.map((f) =>
            f.id === id
              ? { ...f, error: result.error ?? tErr('uploadFailed') }
              : f,
          ),
        )
      }
    },
    [failed, tErr],
  )

  const removeUploaded = useCallback((url: string) => {
    setUploaded((prev) => prev.filter((e) => e.url !== url))
  }, [])

  const reorderUploaded = useCallback((fromUrl: string, toUrl: string) => {
    setUploaded((prev) => {
      const from = prev.findIndex((e) => e.url === fromUrl)
      const to = prev.findIndex((e) => e.url === toUrl)
      if (from < 0 || to < 0 || from === to) return prev
      const next = [...prev]
      const [picked] = next.splice(from, 1)
      if (picked) next.splice(to, 0, picked)
      return next
    })
  }, [])

  const setCoverUploaded = useCallback((url: string) => {
    setUploaded((prev) => {
      const idx = prev.findIndex((e) => e.url === url)
      if (idx <= 0) return prev
      const next = [...prev]
      const [picked] = next.splice(idx, 1)
      if (picked) next.unshift(picked)
      return next
    })
  }, [])

  const clearImages = useCallback(() => {
    setUploaded([])
    setFailed([])
  }, [])

  /**
   * Adopt URLs the user picked from the asset library. They're already
   * R2-hosted (or external image URLs the trainer can fetch), so we
   * skip the upload pipeline entirely and just append them to the
   * uploaded list. Dedupe against existing entries; cap at MAX_IMAGES.
   *
   * `storageKey` is left empty for adopted entries — the cover-pick /
   * reorder / removal flows key on `url`, not storageKey, so this is
   * safe. The trainer service zips by URL too, so storage-key absence
   * doesn't leak through.
   */
  const adoptExistingUrls = useCallback((urls: string[]) => {
    if (urls.length === 0) return
    setUploaded((prev) => {
      const seen = new Set(prev.map((e) => e.url))
      const room = LORA_TRAINING.MAX_IMAGES - prev.length
      const fresh: UploadedTrainingImageEntry[] = []
      for (const url of urls) {
        if (fresh.length >= room) break
        if (seen.has(url)) continue
        seen.add(url)
        fresh.push({ url, storageKey: '', filename: '' })
      }
      return fresh.length === 0 ? prev : [...prev, ...fresh]
    })
  }, [])

  const dismissFailed = useCallback((id: string) => {
    setFailed((prev) => prev.filter((f) => f.id !== id))
  }, [])

  // ─── Submit ─────────────────────────────────────────────────────

  /**
   * Submit a training job. Returns `{job, errorCode?, errorFieldKey?}` so
   * the form can:
   *   - reset only on success (`job !== null`)
   *   - highlight the offending input via `errorFieldKey`
   *   - render a friendly toast keyed off `errorCode` instead of leaking
   *     a raw provider string
   *
   * The structured failure shape comes from `submitLoraTrainingAPI`,
   * which reads `LoraTrainingError.toJSON()` off the wire.
   */
  const submit = useCallback(
    async (data: SubmitLoraTrainingRequest): Promise<SubmitOutcome> => {
      setIsSubmitting(true)
      const response = await submitLoraTrainingAPI(data)
      setIsSubmitting(false)

      if (response.success && response.data) {
        const newJob = response.data
        setJobs((prev) => [newJob, ...prev])
        startPolling(newJob.id)
        toast.success(t('loraTrainingSubmitted'))
        return { job: newJob }
      }

      const failure = response as LoraTrainingSubmitFailure
      const friendly = failure.messageKey
        ? tErr(failure.messageKey)
        : (failure.error ?? t('loraTrainingSubmitFailed'))
      toast.error(friendly)
      return {
        job: null,
        errorCode: failure.code,
        errorFieldKey: failure.fieldKey,
        errorMessage: friendly,
      }
    },
    [startPolling, t, tErr],
  )

  return {
    jobs,
    isLoading,
    isSubmitting,
    submit,
    refresh: fetchJobs,
    activePollingJobId,
    uploaded,
    failed,
    uploadsInFlight,
    uploadImages,
    retryFailedUpload,
    removeUploaded,
    reorderUploaded,
    setCoverUploaded,
    clearImages,
    dismissFailed,
    adoptExistingUrls,
    imageUrls: uploaded.map((e) => e.url),
  }
}
