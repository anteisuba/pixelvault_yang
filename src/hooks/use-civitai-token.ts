'use client'

import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'

import { QUERY_KEYS } from '@/constants/query'

import {
  getCivitaiTokenStatusAPI,
  setCivitaiTokenAPI,
  deleteCivitaiTokenAPI,
} from '@/lib/api-client'
import { queryClient } from '@/lib/query-client'

export interface UseCivitaiTokenReturn {
  hasToken: boolean
  isLoading: boolean
  save: (token: string) => Promise<boolean>
  remove: () => Promise<boolean>
  refresh: () => Promise<void>
}

async function fetchHasCivitaiToken(): Promise<boolean> {
  const result = await getCivitaiTokenStatusAPI()
  if (!result.success || !result.data) {
    throw new Error(result.error ?? 'Failed to load Civitai token status')
  }
  return result.data.hasToken
}

function setHasToken(hasToken: boolean) {
  queryClient.setQueryData(QUERY_KEYS.civitaiToken, hasToken)
}

export function useCivitaiToken(): UseCivitaiTokenReturn {
  const t = useTranslations('CivitaiToken')
  const query = useQuery(
    { queryKey: QUERY_KEYS.civitaiToken, queryFn: fetchHasCivitaiToken },
    queryClient,
  )
  const { refetch } = query
  const refresh = useCallback(async () => {
    await refetch()
  }, [refetch])

  const save = useCallback(
    async (token: string): Promise<boolean> => {
      const result = await setCivitaiTokenAPI(token)
      // 存好的结果由调用方写在「保存」键上（ui-defaults §7.1），这里只管失败。
      if (result.success) {
        setHasToken(true)
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

  return {
    hasToken: query.data ?? false,
    isLoading: query.isPending,
    save,
    remove,
    refresh,
  }
}
