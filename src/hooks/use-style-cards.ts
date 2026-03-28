'use client'

import { useState, useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'

import type {
  StyleCardRecord,
  CreateStyleCardRequest,
  UpdateStyleCardRequest,
} from '@/types'
import {
  listStyleCardsAPI,
  createStyleCardAPI,
  updateStyleCardAPI,
  deleteStyleCardAPI,
} from '@/lib/api-client'

export interface UseStyleCardsReturn {
  cards: StyleCardRecord[]
  isLoading: boolean
  activeCardId: string | null
  setActiveCardId: (id: string | null) => void
  create: (data: CreateStyleCardRequest) => Promise<StyleCardRecord | null>
  update: (id: string, data: UpdateStyleCardRequest) => Promise<boolean>
  remove: (id: string) => Promise<boolean>
  refresh: () => Promise<void>
}

export function useStyleCards(projectId?: string | null): UseStyleCardsReturn {
  const [cards, setCards] = useState<StyleCardRecord[]>([])
  const [activeCardId, setActiveCardId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const t = useTranslations('Toasts')

  const refresh = useCallback(async () => {
    setIsLoading(true)
    const result = await listStyleCardsAPI(projectId)
    if (result.success && result.data) {
      setCards(result.data)
    }
    setIsLoading(false)
  }, [projectId])

  useEffect(() => {
    refresh()
  }, [refresh])

  const create = useCallback(
    async (data: CreateStyleCardRequest): Promise<StyleCardRecord | null> => {
      const result = await createStyleCardAPI(data)
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
    async (id: string, data: UpdateStyleCardRequest): Promise<boolean> => {
      const result = await updateStyleCardAPI(id, data)
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
      const result = await deleteStyleCardAPI(id)
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
