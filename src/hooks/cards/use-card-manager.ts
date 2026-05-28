'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { deferEffectTask } from '@/lib/defer-effect-task'
import {
  makeCardCacheKey,
  readCardCache,
  writeCardCache,
} from '@/lib/card-cache'

// ─── Types ───────────────────────────────────────────────────────

interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

export interface CardManagerApi<TRecord, TCreate, TUpdate> {
  list: (projectId?: string | null) => Promise<ApiResponse<TRecord[]>>
  create: (data: TCreate) => Promise<ApiResponse<TRecord>>
  update: (id: string, data: TUpdate) => Promise<ApiResponse<TRecord>>
  delete: (id: string) => Promise<ApiResponse<void>>
}

export interface CardManagerConfig<TRecord, TCreate, TUpdate> {
  /** Card type identifier for logging */
  cardType: string
  /** API functions */
  api: CardManagerApi<TRecord, TCreate, TUpdate>
  /** Selection mode */
  selectionMode: 'single' | 'multi'
  /** Max selections (only for multi mode) */
  maxSelections?: number
  /** Project ID filter */
  projectId?: string | null
}

export interface UseCardManagerReturn<
  TRecord extends { id: string },
  TCreate,
  TUpdate,
> {
  cards: TRecord[]
  isLoading: boolean
  // Single selection
  activeCardId: string | null
  setActiveCardId: (id: string | null) => void
  activeCard: TRecord | null
  // Multi selection
  activeCardIds: string[]
  setActiveCardIds: (ids: string[]) => void
  toggleCardSelection: (id: string) => void
  activeCards: TRecord[]
  // CRUD
  create: (data: TCreate) => Promise<TRecord | null>
  update: (id: string, data: TUpdate) => Promise<boolean>
  remove: (id: string) => Promise<boolean>
  refresh: () => Promise<void>
}

// ─── Hook ────────────────────────────────────────────────────────

export function useCardManager<
  TRecord extends { id: string },
  TCreate,
  TUpdate,
>(
  config: CardManagerConfig<TRecord, TCreate, TUpdate>,
): UseCardManagerReturn<TRecord, TCreate, TUpdate> {
  const cacheKey = makeCardCacheKey(config.cardType, config.projectId)
  // Seed React state from the module-level cache (if any) so the second+
  // mount of a CardDrawer / panel renders cards instantly instead of
  // showing a spinner while the same data refetches.
  const [cards, setCards] = useState<TRecord[]>(
    () => readCardCache<TRecord[]>(cacheKey) ?? [],
  )
  const [isLoading, setIsLoading] = useState(
    () => readCardCache<TRecord[]>(cacheKey) === undefined,
  )
  const [activeCardId, setActiveCardId] = useState<string | null>(null)
  const [activeCardIds, setActiveCardIds] = useState<string[]>([])
  const t = useTranslations('Toasts')

  const refresh = useCallback(
    async (opts?: { silent?: boolean }) => {
      // `silent` keeps the spinner off while a cache hit is on screen —
      // it's the SWR background pass after an instant cached render.
      if (!opts?.silent) setIsLoading(true)
      const result = await config.api.list(config.projectId)
      if (result.success && result.data) {
        setCards(result.data)
        writeCardCache(cacheKey, result.data)
      }
      if (!opts?.silent) setIsLoading(false)
    },
    [config.api, config.projectId, cacheKey],
  )

  useEffect(() => {
    return deferEffectTask(() => {
      // Cache hit → silent background revalidate. Cache miss → visible
      // loading state until the first fetch lands.
      const hasCached = readCardCache<TRecord[]>(cacheKey) !== undefined
      void refresh({ silent: hasCached })
    })
  }, [refresh, cacheKey])

  const toggleCardSelection = useCallback(
    (id: string) => {
      setActiveCardIds((prev) => {
        if (prev.includes(id)) {
          return prev.filter((x) => x !== id)
        }
        if (config.maxSelections && prev.length >= config.maxSelections) {
          return prev
        }
        return [...prev, id]
      })
    },
    [config.maxSelections],
  )

  const create = useCallback(
    async (data: TCreate): Promise<TRecord | null> => {
      const result = await config.api.create(data)
      if (result.success && result.data) {
        setCards((prev) => {
          const next = [result.data!, ...prev]
          writeCardCache(cacheKey, next)
          return next
        })
        toast.success(t('createSuccess'))
        return result.data
      }
      toast.error(result.error ?? t('createFailed'))
      return null
    },
    [config.api, t, cacheKey],
  )

  const update = useCallback(
    async (id: string, data: TUpdate): Promise<boolean> => {
      const result = await config.api.update(id, data)
      if (result.success && result.data) {
        setCards((prev) => {
          const next = prev.map((c) => (c.id === id ? result.data! : c))
          writeCardCache(cacheKey, next)
          return next
        })
        toast.success(t('updateSuccess'))
        return true
      }
      toast.error(result.error ?? t('updateFailed'))
      return false
    },
    [config.api, t, cacheKey],
  )

  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      const result = await config.api.delete(id)
      if (result.success) {
        setCards((prev) => {
          const next = prev.filter((c) => c.id !== id)
          writeCardCache(cacheKey, next)
          return next
        })
        // Clean up selections
        if (activeCardId === id) setActiveCardId(null)
        setActiveCardIds((prev) => prev.filter((x) => x !== id))
        toast.success(t('deleteSuccess'))
        return true
      }
      toast.error(result.error ?? t('deleteFailed'))
      return false
    },
    [activeCardId, t, config.api, cacheKey],
  )

  const activeCard = useMemo(
    () => cards.find((c) => c.id === activeCardId) ?? null,
    [cards, activeCardId],
  )

  const activeCards = useMemo(
    () => cards.filter((c) => activeCardIds.includes(c.id)),
    [cards, activeCardIds],
  )

  return {
    cards,
    isLoading,
    activeCardId,
    setActiveCardId,
    activeCard,
    activeCardIds,
    setActiveCardIds,
    toggleCardSelection,
    activeCards,
    create,
    update,
    remove,
    refresh,
  }
}
