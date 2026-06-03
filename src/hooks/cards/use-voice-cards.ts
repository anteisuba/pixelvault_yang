'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'

import type { VoiceCardRecord } from '@/types'
import { listVoiceCardsAPI } from '@/lib/api-client'
import { deferEffectTask } from '@/lib/defer-effect-task'

export interface UseVoiceCardsReturn {
  cards: VoiceCardRecord[]
  isLoading: boolean
  error: string | null
  findCard: (id: string) => VoiceCardRecord | null
  refresh: () => Promise<void>
}

export function useVoiceCards(options?: {
  enabled?: boolean
}): UseVoiceCardsReturn {
  const t = useTranslations('StudioPage')
  const enabled = options?.enabled ?? true
  const [cards, setCards] = useState<VoiceCardRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!enabled) {
      return
    }

    setIsLoading(true)
    setError(null)
    const response = await listVoiceCardsAPI(1, 50)
    if (response.success && response.data) {
      setCards(response.data.items)
    } else {
      setError(response.error ?? t('voiceCardsLoadFailed'))
    }
    setIsLoading(false)
  }, [enabled, t])

  useEffect(() => {
    if (!enabled) {
      return undefined
    }

    return deferEffectTask(() => {
      void refresh()
    })
  }, [enabled, refresh])

  const findCard = useCallback(
    (id: string): VoiceCardRecord | null =>
      cards.find((card) => card.id === id) ?? null,
    [cards],
  )

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
