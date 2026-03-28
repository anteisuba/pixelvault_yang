'use client'

import { useState, useCallback, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  listCollectionsAPI,
  createCollectionAPI,
  updateCollectionAPI,
  deleteCollectionAPI,
  addToCollectionAPI,
  removeFromCollectionAPI,
} from '@/lib/api-client'
import type {
  CollectionRecord,
  CreateCollectionRequest,
  UpdateCollectionRequest,
} from '@/types'

interface UseCollectionsReturn {
  collections: CollectionRecord[]
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
  create: (data: CreateCollectionRequest) => Promise<CollectionRecord | null>
  update: (
    id: string,
    data: UpdateCollectionRequest,
  ) => Promise<CollectionRecord | null>
  remove: (id: string) => Promise<boolean>
  addItems: (collectionId: string, generationIds: string[]) => Promise<number>
  removeItem: (collectionId: string, generationId: string) => Promise<boolean>
}

export function useCollections(): UseCollectionsReturn {
  const [collections, setCollections] = useState<CollectionRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const t = useTranslations('Toasts')

  const refresh = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    const result = await listCollectionsAPI()
    if (result.success && result.data) {
      setCollections(result.data)
    } else {
      setError(result.error ?? 'Failed to load collections')
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const create = useCallback(
    async (data: CreateCollectionRequest): Promise<CollectionRecord | null> => {
      const result = await createCollectionAPI(data)
      if (result.success && result.data) {
        setCollections((prev) => [result.data!, ...prev])
        toast.success(t('collectionCreated'))
        return result.data
      }
      toast.error(result.error ?? t('collectionCreateFailed'))
      return null
    },
    [t],
  )

  const update = useCallback(
    async (
      id: string,
      data: UpdateCollectionRequest,
    ): Promise<CollectionRecord | null> => {
      const result = await updateCollectionAPI(id, data)
      if (result.success && result.data) {
        setCollections((prev) =>
          prev.map((c) => (c.id === id ? result.data! : c)),
        )
        toast.success(t('collectionUpdated'))
        return result.data
      }
      toast.error(result.error ?? t('collectionUpdateFailed'))
      return null
    },
    [t],
  )

  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      const result = await deleteCollectionAPI(id)
      if (result.success) {
        setCollections((prev) => prev.filter((c) => c.id !== id))
        toast.success(t('collectionDeleted'))
        return true
      }
      toast.error(result.error ?? t('collectionDeleteFailed'))
      return false
    },
    [t],
  )

  const addItems = useCallback(
    async (collectionId: string, generationIds: string[]): Promise<number> => {
      const result = await addToCollectionAPI(collectionId, generationIds)
      if (result.success && result.data) {
        // Refresh collection counts
        void refresh()
        return result.data.added
      }
      toast.error(result.error ?? 'Failed to add to collection')
      return 0
    },
    [refresh],
  )

  const removeItem = useCallback(
    async (collectionId: string, generationId: string): Promise<boolean> => {
      const result = await removeFromCollectionAPI(collectionId, generationId)
      if (result.success) {
        void refresh()
        return true
      }
      toast.error(result.error ?? 'Failed to remove from collection')
      return false
    },
    [refresh],
  )

  return {
    collections,
    isLoading,
    error,
    refresh,
    create,
    update,
    remove,
    addItems,
    removeItem,
  }
}
