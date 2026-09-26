'use client'

import { useEffect, useState } from 'react'

import { getCharacterCardGenerationsAPI } from '@/lib/api-client/cards'
import type { GenerationRecord } from '@/types'

/** 角色详情「用她出的」一次拿最近这么多张（接口上限 50）。 */
const USAGE_PAGE_LIMIT = 30

export interface CharacterCardUsage {
  generations: GenerationRecord[]
  total: number | null
  isLoading: boolean
}

/**
 * 用这个角色出过的图（角色详情左边「图片」模块）。⚠ 只在详情打开时拉（`enabled`），
 * 换角色时丢掉上一位的结果。
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
    void getCharacterCardGenerationsAPI(cardId, 1, USAGE_PAGE_LIMIT).then(
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
