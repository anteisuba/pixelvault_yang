'use client'

import { useState, useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'

import type {
  ModelCardRecord,
  CreateModelCardRequest,
  UpdateModelCardRequest,
} from '@/types'
import {
  listModelCardsAPI,
  createModelCardAPI,
  updateModelCardAPI,
  deleteModelCardAPI,
} from '@/lib/api-client'

export interface UseModelCardsReturn {
  cards: ModelCardRecord[]
  isLoading: boolean
  activeCardId: string | null
  setActiveCardId: (id: string | null) => void
  create: (data: CreateModelCardRequest) => Promise<ModelCardRecord | null>
  update: (id: string, data: UpdateModelCardRequest) => Promise<boolean>
  remove: (id: string) => Promise<boolean>
  refresh: () => Promise<void>
}

export function useModelCards(projectId?: string | null): UseModelCardsReturn {
  const [cards, setCards] = useState<ModelCardRecord[]>([])
  const [activeCardId, setActiveCardId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const t = useTranslations('Toasts')

  const refresh = useCallback(async () => {
    setIsLoading(true)
    const result = await listModelCardsAPI(projectId)
    if (result.success && result.data) {
      setCards(result.data)
    }
    setIsLoading(false)
  }, [projectId])

  useEffect(() => {
    refresh()
  }, [refresh])

  const create = useCallback(
    async (data: CreateModelCardRequest): Promise<ModelCardRecord | null> => {
      const result = await createModelCardAPI(data)
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
    async (id: string, data: UpdateModelCardRequest): Promise<boolean> => {
      const result = await updateModelCardAPI(id, data)
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
      const result = await deleteModelCardAPI(id)
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
