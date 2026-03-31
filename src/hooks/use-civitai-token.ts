'use client'

import { useState, useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'

import {
  getCivitaiTokenStatusAPI,
  setCivitaiTokenAPI,
  deleteCivitaiTokenAPI,
} from '@/lib/api-client'
import { deferEffectTask } from '@/lib/defer-effect-task'

export interface UseCivitaiTokenReturn {
  hasToken: boolean
  isLoading: boolean
  save: (token: string) => Promise<boolean>
  remove: () => Promise<boolean>
  refresh: () => Promise<void>
}

export function useCivitaiToken(): UseCivitaiTokenReturn {
  const [hasToken, setHasToken] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const t = useTranslations('CivitaiToken')

  const refresh = useCallback(async () => {
    setIsLoading(true)
    const result = await getCivitaiTokenStatusAPI()
    if (result.success && result.data) {
      setHasToken(result.data.hasToken)
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    return deferEffectTask(() => {
      void refresh()
    })
  }, [refresh])

  const save = useCallback(
    async (token: string): Promise<boolean> => {
      const result = await setCivitaiTokenAPI(token)
      if (result.success) {
        setHasToken(true)
        toast.success(t('saveSuccess'))
        return true
      }
      toast.error(result.error ?? t('saveFailed'))
      return false
    },
    [t],
  )

  const remove = useCallback(async (): Promise<boolean> => {
    const result = await deleteCivitaiTokenAPI()
    if (result.success) {
      setHasToken(false)
      toast.success(t('removeSuccess'))
      return true
    }
    toast.error(result.error ?? t('removeFailed'))
    return false
  }, [t])

  return { hasToken, isLoading, save, remove, refresh }
}
