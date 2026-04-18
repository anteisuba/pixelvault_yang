'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import type {
  ProjectRecord,
  CreateProjectRequest,
  UpdateProjectRequest,
  GenerationRecord,
} from '@/types'
import {
  listProjectsAPI,
  createProjectAPI,
  updateProjectAPI,
  deleteProjectAPI,
  getProjectHistoryAPI,
} from '@/lib/api-client'
import { deferEffectTask } from '@/lib/defer-effect-task'

export interface UseProjectsReturn {
  projects: ProjectRecord[]
  activeProjectId: string | null
  isLoading: boolean
  error: string | null
  setActiveProjectId: (id: string | null) => void
  create: (data: CreateProjectRequest) => Promise<ProjectRecord | null>
  update: (id: string, data: UpdateProjectRequest) => Promise<boolean>
  remove: (id: string) => Promise<boolean>
  refresh: () => Promise<void>
  // History for active project
  history: GenerationRecord[]
  historyTotal: number
  historyHasMore: boolean
  isLoadingHistory: boolean
  loadHistory: () => Promise<void>
  loadMoreHistory: () => Promise<void>
  // History type filter
  historyTypeFilter: string
  setHistoryTypeFilter: (type: string) => void
}

export function useProjects(): UseProjectsReturn {
  const [projects, setProjects] = useState<ProjectRecord[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const t = useTranslations('Toasts')

  // History state
  const [history, setHistory] = useState<GenerationRecord[]>([])
  const [historyTotal, setHistoryTotal] = useState(0)
  const [historyHasMore, setHistoryHasMore] = useState(false)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [historyTypeFilter, setHistoryTypeFilter] = useState('all')
  // Monotonically-increasing request ID — stale responses are dropped.
  // Prevents the default 'all' fetch on mount from overwriting a later
  // mode-specific fetch when consumers call setHistoryTypeFilter immediately.
  const loadHistoryReqIdRef = useRef(0)

  // ─── Project CRUD ───────────────────────────────────────────────

  const fetchProjects = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    const response = await listProjectsAPI()
    if (response.success && response.data) {
      setProjects(response.data)
    } else {
      setError(response.error ?? 'Failed to load projects')
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    return deferEffectTask(() => {
      void fetchProjects()
    })
  }, [fetchProjects])

  const create = useCallback(
    async (data: CreateProjectRequest): Promise<ProjectRecord | null> => {
      const response = await createProjectAPI(data)
      if (response.success && response.data) {
        setError(null)
        const newProject = response.data
        setProjects((prev) => [newProject, ...prev])
        toast.success(t('projectCreated'))
        return newProject
      }
      const msg = response.error ?? 'Failed to create project'
      setError(msg)
      toast.error(msg)
      return null
    },
    [t],
  )

  const update = useCallback(
    async (id: string, data: UpdateProjectRequest): Promise<boolean> => {
      const response = await updateProjectAPI(id, data)
      if (response.success && response.data) {
        setError(null)
        setProjects((prev) =>
          prev.map((p) => (p.id === id ? response.data! : p)),
        )
        toast.success(t('projectUpdated'))
        return true
      }
      const msg = response.error ?? 'Failed to update project'
      setError(msg)
      toast.error(msg)
      return false
    },
    [t],
  )

  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      const response = await deleteProjectAPI(id)
      if (response.success) {
        setError(null)
        setProjects((prev) => prev.filter((p) => p.id !== id))
        if (activeProjectId === id) {
          setActiveProjectId(null)
        }
        toast.success(t('projectDeleted'))
        return true
      }
      const msg = response.error ?? 'Failed to delete project'
      setError(msg)
      toast.error(msg)
      return false
    },
    [activeProjectId, t],
  )

  // ─── History ────────────────────────────────────────────────────

  const loadHistory = useCallback(async () => {
    if (activeProjectId === undefined) return
    const reqId = ++loadHistoryReqIdRef.current
    setIsLoadingHistory(true)
    const pid = activeProjectId ?? 'unassigned'
    const response = await getProjectHistoryAPI(
      pid,
      undefined,
      undefined,
      historyTypeFilter,
    )
    // Drop stale responses — only the latest request wins.
    if (reqId !== loadHistoryReqIdRef.current) return
    if (response.success && response.data) {
      setHistory(response.data.generations)
      setHistoryTotal(response.data.total)
      setHistoryHasMore(response.data.hasMore)
    }
    setIsLoadingHistory(false)
  }, [activeProjectId, historyTypeFilter])

  const loadMoreHistory = useCallback(async () => {
    if (!historyHasMore || isLoadingHistory || history.length === 0) return
    const reqId = ++loadHistoryReqIdRef.current
    const pid = activeProjectId ?? 'unassigned'
    const lastId = history[history.length - 1].id
    const response = await getProjectHistoryAPI(
      pid,
      lastId,
      undefined,
      historyTypeFilter,
    )
    // Drop if a newer request was issued (e.g. user switched mode mid-pagination)
    if (reqId !== loadHistoryReqIdRef.current) return
    if (response.success && response.data) {
      setHistory((prev) => [...prev, ...response.data!.generations])
      setHistoryTotal(response.data.total)
      setHistoryHasMore(response.data.hasMore)
    }
  }, [
    activeProjectId,
    history,
    historyHasMore,
    isLoadingHistory,
    historyTypeFilter,
  ])

  // Reload history when active project changes
  useEffect(() => {
    return deferEffectTask(() => {
      void loadHistory()
    })
  }, [loadHistory])

  return {
    projects,
    activeProjectId,
    isLoading,
    error,
    setActiveProjectId,
    create,
    update,
    remove,
    refresh: fetchProjects,
    history,
    historyTotal,
    historyHasMore,
    isLoadingHistory,
    loadHistory,
    loadMoreHistory,
    historyTypeFilter,
    setHistoryTypeFilter,
  }
}
