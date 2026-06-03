'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'

import { SCENE_POLL_INTERVAL_MS } from '@/constants/video-scene'
import {
  advanceSceneAPI,
  getSceneStatusAPI,
  retrySceneAPI,
  startOrchestrationAPI,
} from '@/lib/api-client'
import {
  VideoScriptSceneStatus,
  VideoScriptStatus,
} from '@/lib/generated/prisma/enums'
import type { SceneOrchestratorStatus } from '@/types/video-script'

interface UseSceneOrchestratorReturn {
  status: SceneOrchestratorStatus | null
  isLoading: boolean
  isStarting: boolean
  isAdvancing: boolean
  isRetrying: boolean
  isPolling: boolean
  error: string | null
  refresh: () => Promise<SceneOrchestratorStatus | null>
  start: () => Promise<boolean>
  advance: () => Promise<boolean>
  retry: (sceneIndex: number) => Promise<boolean>
}

function shouldPoll(status: SceneOrchestratorStatus | null): boolean {
  if (!status) return false
  if (
    status.scriptStatus === VideoScriptStatus.COMPLETED ||
    status.scriptStatus === VideoScriptStatus.FAILED
  ) {
    return false
  }

  return status.scenes.some(
    (scene) =>
      scene.status === VideoScriptSceneStatus.FRAME_GENERATING ||
      scene.status === VideoScriptSceneStatus.CLIP_GENERATING,
  )
}

export function useSceneOrchestrator(
  scriptId: string | null,
): UseSceneOrchestratorReturn {
  const t = useTranslations('VideoScript')
  const [status, setStatus] = useState<SceneOrchestratorStatus | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [isAdvancing, setIsAdvancing] = useState(false)
  const [isRetrying, setIsRetrying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isPolling = useMemo(() => shouldPoll(status), [status])

  const refresh =
    useCallback(async (): Promise<SceneOrchestratorStatus | null> => {
      if (!scriptId) {
        setStatus(null)
        setError(null)
        return null
      }

      setIsLoading(true)
      setError(null)
      const res = await getSceneStatusAPI(scriptId)
      setIsLoading(false)

      if (res.success && res.data) {
        setStatus(res.data)
        return res.data
      }

      setError(res.error ?? t('sceneStatusLoadFailed'))
      return null
    }, [scriptId, t])

  const start = useCallback(async (): Promise<boolean> => {
    if (!scriptId) return false

    setIsStarting(true)
    setError(null)
    const res = await startOrchestrationAPI(scriptId)
    setIsStarting(false)

    if (!res.success) {
      setError(res.error ?? t('sceneStartFailed'))
      return false
    }

    await refresh()
    return true
  }, [refresh, scriptId, t])

  const advance = useCallback(async (): Promise<boolean> => {
    if (!scriptId) return false

    setIsAdvancing(true)
    setError(null)
    const res = await advanceSceneAPI(scriptId)
    setIsAdvancing(false)

    if (!res.success) {
      setError(res.error ?? t('sceneAdvanceFailed'))
      return false
    }

    await refresh()
    return true
  }, [refresh, scriptId, t])

  const retry = useCallback(
    async (sceneIndex: number): Promise<boolean> => {
      if (!scriptId) return false

      setIsRetrying(true)
      setError(null)
      const res = await retrySceneAPI(scriptId, sceneIndex)
      setIsRetrying(false)

      if (!res.success) {
        setError(res.error ?? t('sceneRetryFailed'))
        return false
      }

      await refresh()
      return true
    },
    [refresh, scriptId, t],
  )

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      const nextStatus = await refresh()
      if (cancelled || nextStatus) return
      setStatus(null)
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [refresh])

  useEffect(() => {
    if (!scriptId || !isPolling) return

    const intervalId = window.setInterval(() => {
      void refresh()
    }, SCENE_POLL_INTERVAL_MS)

    return () => window.clearInterval(intervalId)
  }, [isPolling, refresh, scriptId])

  return {
    status,
    isLoading,
    isStarting,
    isAdvancing,
    isRetrying,
    isPolling,
    error,
    refresh,
    start,
    advance,
    retry,
  }
}
