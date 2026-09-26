'use client'

import { useEffect, useState } from 'react'

import { getCharacterCardGenerationsAPI } from '@/lib/api-client/cards'
import type { GenerationRecord } from '@/types'

/** 侧栏「用在哪」一行只看最近几张。 */
const USAGE_PREVIEW_LIMIT = 8

export interface CharacterCardUsage {
  generations: GenerationRecord[]
  total: number | null
  isLoading: boolean
}

/**
 * 这张卡出过的图（卡片页侧栏「用在哪」）。⚠ 只在那一行展开时拉（`enabled`），
 * 换卡时丢掉上一张的结果。
 */
export function useCharacterCardUsage(
  cardId: string | null,
  enabled: boolean,
): CharacterCardUsage {
  const [result, setResult] = useState<{
    cardId: string
    generations: GenerationRecord[]
    total: number | null
  } | null>(null)

  useEffect(() => {
    if (!cardId || !enabled) return
    let live = true
    void getCharacterCardGenerationsAPI(cardId, 1, USAGE_PREVIEW_LIMIT).then(
      (response) => {
        if (!live) return
        setResult({
          cardId,
          generations: response.data?.generations ?? [],
          total: response.data?.total ?? null,
        })
      },
    )
    return () => {
      live = false
    }
  }, [cardId, enabled])

  // 换卡时上一张的结果不算数：按卡 id 认，不在 effect 里清。
  const current = result && result.cardId === cardId ? result : null
  return {
    generations: current?.generations ?? [],
    total: current?.total ?? null,
    isLoading: Boolean(cardId) && enabled && current === null,
  }
}
