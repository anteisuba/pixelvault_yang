'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  deleteExtractedElementAPI,
  listExtractedElementsAPI,
} from '@/lib/api-client/extracted-elements'
import { deferEffectTask } from '@/lib/defer-effect-task'
import type { ExtractedElementRecord } from '@/types'

export interface UseExtractedElementsReturn {
  items: ExtractedElementRecord[]
  isLoading: boolean
  refresh: () => Promise<void>
  remove: (id: string) => Promise<boolean>
  /**
   * Optimistically push a newly-created record to the head of the list so the
   * caller (extract page Save button) sees it appear without waiting for a
   * full refresh round-trip.
   */
  prepend: (record: ExtractedElementRecord) => void
}

/**
 * Client-side hook for the user's saved cutouts. Owns the list state +
 * optimistic mutations so the extract page can flip the UI without a
 * round-trip on every save / delete.
 */
export function useExtractedElements(): UseExtractedElementsReturn {
  const t = useTranslations('StudioImageEdit')
  const [items, setItems] = useState<ExtractedElementRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const refresh = useCallback(async () => {
    setIsLoading(true)
    const result = await listExtractedElementsAPI()
    if (result.success && result.data) {
      setItems(result.data.items)
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    return deferEffectTask(() => {
      void refresh()
    })
  }, [refresh])

  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      const previous = items
      setItems((prev) => prev.filter((item) => item.id !== id))
      const result = await deleteExtractedElementAPI(id)
      if (!result.success) {
        setItems(previous)
        toast.error(result.error ?? t('extract.saveFailed'))
        return false
      }
      return true
    },
    [items, t],
  )

  const prepend = useCallback((record: ExtractedElementRecord) => {
    setItems((prev) => {
      if (prev.some((item) => item.id === record.id)) return prev
      return [record, ...prev]
    })
  }, [])

  return {
    items,
    isLoading,
    refresh,
    remove,
    prepend,
  }
}
