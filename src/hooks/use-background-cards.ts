'use client'

import { useState, useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'

import type {
  BackgroundCardRecord,
  CreateBackgroundCardRequest,
  UpdateBackgroundCardRequest,
} from '@/types'
import {
  listBackgroundCardsAPI,
  createBackgroundCardAPI,
  updateBackgroundCardAPI,
  deleteBackgroundCardAPI,
} from '@/lib/api-client'

export interface UseBackgroundCardsReturn {
  cards: BackgroundCardRecord[]
  isLoading: boolean
  activeCardId: string | null
  setActiveCardId: (id: string | null) => void
  create: (
    data: CreateBackgroundCardRequest,
  ) => Promise<BackgroundCardRecord | null>
  update: (id: string, data: UpdateBackgroundCardRequest) => Promise<boolean>
  remove: (id: string) => Promise<boolean>
  refresh: () => Promise<void>
}

export function useBackgroundCards(
  projectId?: string | null,
): UseBackgroundCardsReturn {
  const [cards, setCards] = useState<BackgroundCardRecord[]>([])
  const [activeCardId, setActiveCardId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const t = useTranslations('Toasts')

  const refresh = useCallback(async () => {
    setIsLoading(true)
    const result = await listBackgroundCardsAPI(projectId)
    if (result.success && result.data) {
      setCards(result.data)
    }
    setIsLoading(false)
  }, [projectId])

  useEffect(() => {
    refresh()
  }, [refresh])

  const create = useCallback(
    async (
      data: CreateBackgroundCardRequest,
    ): Promise<BackgroundCardRecord | null> => {
      const result = await createBackgroundCardAPI(data)
      if (result.success && result.data) {
        setCards((prev) => [result.data!, ...prev])
        toast.success(t('createSuccess'))
        return result.data
      }
      toast.error(result.error ?? t('createFailed'))
      return null
    },
    [t],
  )

  const update = useCallback(
    async (id: string, data: UpdateBackgroundCardRequest): Promise<boolean> => {
      const result = await updateBackgroundCardAPI(id, data)
      if (result.success && result.data) {
        setCards((prev) => prev.map((c) => (c.id === id ? result.data! : c)))
        toast.success(t('updateSuccess'))
        return true
      }
      toast.error(result.error ?? t('updateFailed'))
      return false
    },
    [t],
  )

  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      const result = await deleteBackgroundCardAPI(id)
      if (result.success) {
        setCards((prev) => prev.filter((c) => c.id !== id))
        if (activeCardId === id) setActiveCardId(null)
        toast.success(t('deleteSuccess'))
        return true
      }
      toast.error(result.error ?? t('deleteFailed'))
      return false
    },
    [activeCardId, t],
  )

  return {
    cards,
    isLoading,
    activeCardId,
    setActiveCardId,
    create,
    update,
    remove,
    refresh,
  }
}
