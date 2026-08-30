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
  /**
   * ⚠ 存**文案键**不存译文。
   *
   * 译文要 `t`，而 `t` 一旦进 `refresh` 的依赖，`refresh` 就每渲染换一个新引用——
   * 下面那个 effect 的依赖里正好有它，于是每渲染都重新排一次拉取，`setIsLoading(true)`
   * 也跟着一遍遍闪。真机症状：在配音间收藏一下，整个音色库网格闪回骨架。
   * （`useTranslations()` 每次返回新函数，同一个坑在 `use-voice-library` 里让列表
   * 永远停在加载态。）
   */
  const [failure, setFailure] = useState<{ message?: string } | null>(null)

  const refresh = useCallback(async () => {
    if (!enabled) {
      return
    }

    setIsLoading(true)
    setFailure(null)
    const response = await listVoiceCardsAPI(1, 50)
    if (response.success && response.data) {
      setCards(response.data.items)
    } else {
      setFailure({ message: response.error })
    }
    setIsLoading(false)
  }, [enabled])

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

  // 译文在这里才生成：数据层只认「失败了没有」，`t` 于是不进任何依赖数组。
  const error = failure ? (failure.message ?? t('voiceCardsLoadFailed')) : null

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
