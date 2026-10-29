'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { CHARACTER_OPINION_PREFIX } from '@/constants/character-browse'
import {
  deleteAssistantMemoryAPI,
  deleteCharacterFindingAPI,
  getCharacterGrowthAPI,
  goOutNowAPI,
  revertCharacterRevisionAPI,
  updateAssistantMemoryAPI,
  updateCharacterBrowseAPI,
} from '@/lib/api-client'
import { deferEffectTask } from '@/lib/defer-effect-task'
import type {
  CharacterGrowth,
  UpdateCharacterBrowseRequest,
} from '@/types/character-growth'

/** 写操作的结果：失败带 `i18nKey` 时调用方说人话。 */
export type GrowthWriteResult =
  | { ok: true }
  | { ok: false; error: string; i18nKey?: string }

/**
 * 角色页右栏「最近」（C 第 3 步起；2026-10-28 改版 B）：她的日记、她改了什么、见闻、观点、
 * 出门设置；撤回一条、改出门开关与型号、删见闻、改 / 删观点。`cardId` 为空 = 什么都不读；
 * 换角色时调用方用 key 重置。撤回成功后整份重读（左栏那几格也跟着变），其余就地改手里那份。
 */
export function useCharacterGrowth(cardId: string | null) {
  const [growth, setGrowth] = useState<CharacterGrowth | null>(null)
  const [isLoading, setIsLoading] = useState(Boolean(cardId))
  const [error, setError] = useState<string | null>(null)
  const [revertingId, setRevertingId] = useState<string | null>(null)
  /** 打开开关后她正在外面逛（等这一趟回来再整份重读）。 */
  const [goingOut, setGoingOut] = useState(false)
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

  const write = useCallback(
    async (
      call: () => Promise<
        { success: true } | { success: false; error: string; i18nKey?: string }
      >,
      apply: (current: CharacterGrowth) => CharacterGrowth,
    ): Promise<GrowthWriteResult> => {
      const result = await call()
      if (!aliveRef.current) return { ok: result.success } as GrowthWriteResult
      if (!result.success) {
        return { ok: false, error: result.error, i18nKey: result.i18nKey }
      }
      setGrowth((current) => (current ? apply(current) : current))
      return { ok: true }
    },
    [],
  )

  const setBrowse = useCallback(
    async (input: UpdateCharacterBrowseRequest): Promise<GrowthWriteResult> => {
      if (!cardId) return { ok: false, error: 'No character' }
      const result = await updateCharacterBrowseAPI(cardId, input)
      if (!aliveRef.current) return { ok: result.success } as GrowthWriteResult
      if (!result.success) {
        return { ok: false, error: result.error, i18nKey: result.i18nKey }
      }
      setGrowth((current) =>
        current ? { ...current, browse: result.data } : current,
      )
      return { ok: true }
    },
    [cardId],
  )

  /** 打开就出门（owner 2026-10-29）：逛完整份重读，河里接上这一趟；失败只在状态行体现，不弹错。 */
  const goOutNow = useCallback(async (): Promise<void> => {
    if (!cardId) return
    setGoingOut(true)
    const result = await goOutNowAPI(cardId)
    if (!aliveRef.current) return
    setGoingOut(false)
    if (result.success && result.data.went) await reload()
  }, [cardId, reload])

  const removeFinding = useCallback(
    (findingId: string) =>
      write(
        () => deleteCharacterFindingAPI(findingId),
        (current) => ({
          ...current,
          findings: current.findings.filter((row) => row.id !== findingId),
        }),
      ),
    [write],
  )

  const editOpinion = useCallback(
    (opinionId: string, text: string) =>
      write(
        () =>
          updateAssistantMemoryAPI(opinionId, {
            text: `${CHARACTER_OPINION_PREFIX}${text.trim()}`,
          }),
        (current) => ({
          ...current,
          opinions: current.opinions.map((row) =>
            row.id === opinionId ? { ...row, text: text.trim() } : row,
          ),
        }),
      ),
    [write],
  )

  const removeOpinion = useCallback(
    (opinionId: string) =>
      write(
        () => deleteAssistantMemoryAPI(opinionId),
        (current) => ({
          ...current,
          opinions: current.opinions.filter((row) => row.id !== opinionId),
        }),
      ),
    [write],
  )

  return {
    growth,
    isLoading,
    error,
    revertingId,
    revert,
    reload,
    setBrowse,
    goingOut,
    goOutNow,
    removeFinding,
    editOpinion,
    removeOpinion,
  }
}
