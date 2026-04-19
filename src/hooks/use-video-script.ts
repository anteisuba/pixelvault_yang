'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import {
  createVideoScriptAPI,
  deleteVideoScriptAPI,
  getVideoScriptAPI,
  listVideoScriptsAPI,
  updateVideoScriptAPI,
} from '@/lib/api-client'
import { VideoScriptStatus } from '@/lib/generated/prisma/enums'
import type {
  CreateVideoScriptInput,
  VideoScriptRecord,
  VideoScriptScene,
} from '@/types/video-script'

// ─── useVideoScript (single script editing) ──────────────────────

export interface UseVideoScriptReturn {
  script: VideoScriptRecord | null
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
  save: (scenes: VideoScriptScene[]) => Promise<boolean>
  confirm: () => Promise<boolean>
  remove: () => Promise<boolean>
}

export function useVideoScript(id: string | null): UseVideoScriptReturn {
  const [script, setScript] = useState<VideoScriptRecord | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!id) {
      setScript(null)
      return
    }
    setIsLoading(true)
    setError(null)
    const res = await getVideoScriptAPI(id)
    if (res.success && res.data) {
      setScript(res.data)
    } else {
      setError(res.error ?? 'Failed to load script')
    }
    setIsLoading(false)
  }, [id])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!id) {
        setScript(null)
        return
      }
      setIsLoading(true)
      setError(null)
      const res = await getVideoScriptAPI(id)
      if (cancelled) return
      if (res.success && res.data) {
        setScript(res.data)
      } else {
        setError(res.error ?? 'Failed to load script')
      }
      setIsLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [id])

  const save = useCallback(
    async (scenes: VideoScriptScene[]): Promise<boolean> => {
      if (!id) return false
      setIsLoading(true)
      setError(null)
      const res = await updateVideoScriptAPI(id, { scenes })
      setIsLoading(false)
      if (res.success && res.data) {
        setScript(res.data)
        return true
      }
      setError(res.error ?? 'Failed to save scenes')
      return false
    },
    [id],
  )

  const confirm = useCallback(async (): Promise<boolean> => {
    if (!id) return false
    setIsLoading(true)
    setError(null)
    const res = await updateVideoScriptAPI(id, {
      status: VideoScriptStatus.SCRIPT_READY,
    })
    setIsLoading(false)
    if (res.success && res.data) {
      setScript(res.data)
      return true
    }
    setError(res.error ?? 'Failed to confirm script')
    return false
  }, [id])

  const remove = useCallback(async (): Promise<boolean> => {
    if (!id) return false
    setIsLoading(true)
    setError(null)
    const res = await deleteVideoScriptAPI(id)
    setIsLoading(false)
    if (res.success) {
      setScript(null)
      return true
    }
    setError(res.error ?? 'Failed to delete script')
    return false
  }, [id])

  return { script, isLoading, error, refresh, save, confirm, remove }
}

// ─── useVideoScriptList (pagination) ─────────────────────────────

const DEFAULT_PAGE_SIZE = 20

export interface UseVideoScriptListReturn {
  scripts: VideoScriptRecord[]
  isLoading: boolean
  error: string | null
  hasMore: boolean
  loadMore: () => Promise<void>
  refresh: () => Promise<void>
}

export function useVideoScriptList(
  size: number = DEFAULT_PAGE_SIZE,
): UseVideoScriptListReturn {
  const [scripts, setScripts] = useState<VideoScriptRecord[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fetchLock = useRef(false)

  const fetchPage = useCallback(
    async (targetPage: number, replace: boolean) => {
      if (fetchLock.current) return
      fetchLock.current = true
      setIsLoading(true)
      setError(null)
      const res = await listVideoScriptsAPI({ page: targetPage, size })
      setIsLoading(false)
      fetchLock.current = false
      if (res.success && res.data) {
        setTotal(res.data.total)
        setPage(targetPage)
        setScripts((prev) =>
          replace ? res.data!.scripts : [...prev, ...res.data!.scripts],
        )
      } else {
        setError(res.error ?? 'Failed to load scripts')
      }
    },
    [size],
  )

  const refresh = useCallback(() => fetchPage(1, true), [fetchPage])
  const loadMore = useCallback(
    () => fetchPage(page + 1, false),
    [fetchPage, page],
  )

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const hasMore = scripts.length < total

  return { scripts, isLoading, error, hasMore, loadMore, refresh }
}

// ─── useCreateVideoScript (imperative create) ────────────────────

export interface UseCreateVideoScriptReturn {
  create: (input: CreateVideoScriptInput) => Promise<VideoScriptRecord | null>
  isLoading: boolean
  error: string | null
}

export function useCreateVideoScript(): UseCreateVideoScriptReturn {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = useCallback(
    async (
      input: CreateVideoScriptInput,
    ): Promise<VideoScriptRecord | null> => {
      setIsLoading(true)
      setError(null)
      const res = await createVideoScriptAPI(input)
      setIsLoading(false)
      if (res.success && res.data) return res.data
      setError(res.error ?? 'Failed to create script')
      return null
    },
    [],
  )

  return { create, isLoading, error }
}
