'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { deferEffectTask } from '@/lib/defer-effect-task'
import type { LoraTrainingRecord, SubmitLoraTrainingRequest } from '@/types'
import {
  submitLoraTrainingAPI,
  listLoraTrainingJobsAPI,
  getLoraTrainingStatusAPI,
} from '@/lib/api-client'
import { LORA_TRAINING } from '@/constants/config'

export interface UseLoraTrainingReturn {
  jobs: LoraTrainingRecord[]
  isLoading: boolean
  isSubmitting: boolean
  submit: (
    data: SubmitLoraTrainingRequest,
  ) => Promise<LoraTrainingRecord | null>
  refresh: () => Promise<void>
  activePollingJobId: string | null
}

export function useLoraTraining(): UseLoraTrainingReturn {
  const [jobs, setJobs] = useState<LoraTrainingRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activePollingJobId, setActivePollingJobId] = useState<string | null>(
    null,
  )
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const t = useTranslations('Toasts')

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

  // ─── Submit ─────────────────────────────────────────────────────

  const submit = useCallback(
    async (
      data: SubmitLoraTrainingRequest,
    ): Promise<LoraTrainingRecord | null> => {
      setIsSubmitting(true)
      const response = await submitLoraTrainingAPI(data)
      setIsSubmitting(false)

      if (response.success && response.data) {
        const newJob = response.data
        setJobs((prev) => [newJob, ...prev])
        startPolling(newJob.id)
        toast.success(t('loraTrainingSubmitted'))
        return newJob
      }

      toast.error(response.error ?? t('loraTrainingSubmitFailed'))
      return null
    },
    [startPolling, t],
  )

  return {
    jobs,
    isLoading,
    isSubmitting,
    submit,
    refresh: fetchJobs,
    activePollingJobId,
  }
}
