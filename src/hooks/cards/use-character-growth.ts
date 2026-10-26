'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import {
  getCharacterGrowthAPI,
  revertCharacterRevisionAPI,
} from '@/lib/api-client'
import { deferEffectTask } from '@/lib/defer-effect-task'
import type { CharacterGrowth } from '@/types/character-growth'

/**
 * 设置「她」那一页（C 第 3 步）：选中的角色的日记与「她改了什么」，能撤回一条。
 * `cardId` 为空 = 还没选角色，什么都不读；换角色时调用方用 key 重置。撤回成功后整份重读。
 */
export function useCharacterGrowth(cardId: string | null) {
  const [growth, setGrowth] = useState<CharacterGrowth | null>(null)
  const [isLoading, setIsLoading] = useState(Boolean(cardId))
  const [error, setError] = useState<string | null>(null)
  const [revertingId, setRevertingId] = useState<string | null>(null)
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  const reload = useCallback(async () => {
    if (!cardId) return
    setIsLoading(true)
    const result = await getCharacterGrowthAPI(cardId)
    if (!aliveRef.current) return
    setIsLoading(false)
    if (result.success) {
      setGrowth(result.data)
      setError(null)
    } else {
      setError(result.error)
    }
  }, [cardId])

  useEffect(() => {
    if (!cardId) return
    return deferEffectTask(() => {
      void reload()
    })
  }, [cardId, reload])

  const revert = useCallback(
    async (revisionId: string): Promise<boolean> => {
      setRevertingId(revisionId)
      const result = await revertCharacterRevisionAPI(revisionId)
      if (!aliveRef.current) return result.success
      setRevertingId(null)
      if (!result.success) {
        setError(result.error)
        return false
      }
      await reload()
      return true
    },
    [reload],
  )

  return { growth, isLoading, error, revertingId, revert, reload }
}
