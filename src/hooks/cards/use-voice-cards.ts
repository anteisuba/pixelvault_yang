'use client'

import { useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { QUERY_KEYS } from '@/constants/query'
import type { VoiceCardRecord } from '@/types'
import { listVoiceCardsAPI } from '@/lib/api-client'
import { queryClient } from '@/lib/query-client'

export interface UseVoiceCardsReturn {
  cards: VoiceCardRecord[]
  isLoading: boolean
  error: string | null
  findCard: (id: string) => VoiceCardRecord | null
  refresh: () => Promise<void>
}

const EMPTY: VoiceCardRecord[] = []

/** 失败时 message 是服务端给的那句（可能没有，界面就用通用文案）。 */
async function fetchVoiceCards(): Promise<VoiceCardRecord[]> {
  const response = await listVoiceCardsAPI(1, 50)
  if (!response.success || !response.data) {
    throw new Error(response.error ?? '')
  }
  return response.data.items
}

export function useVoiceCards(options?: {
  enabled?: boolean
}): UseVoiceCardsReturn {
  const t = useTranslations('StudioPage')
  const enabled = options?.enabled ?? true
  const query = useQuery(
    {
      queryKey: QUERY_KEYS.voiceCards,
      queryFn: fetchVoiceCards,
      enabled,
    },
    queryClient,
  )
  const cards = query.data ?? EMPTY
  const { refetch } = query
  const refresh = useCallback(async () => {
    if (enabled) await refetch()
  }, [enabled, refetch])

  const findCard = useCallback(
    (id: string): VoiceCardRecord | null =>
      cards.find((card) => card.id === id) ?? null,
    [cards],
  )

  // 译文在这里才生成：数据层只认「失败了没有」，`t` 不进取数那一层。
  const error = query.isError
    ? query.error.message || t('voiceCardsLoadFailed')
    : null
  const isLoading = query.isFetching

  return useMemo(
    () => ({
      cards,
      isLoading,
      error,
      findCard,
      refresh,
    }),
    [cards, error, findCard, isLoading, refresh],
  )
}
