'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import {
  CHARACTER_OPINION_PREFIX,
  CHARACTER_OUTING,
} from '@/constants/character-browse'
import {
  deleteAssistantMemoryAPI,
  deleteCharacterFindingAPI,
  deleteCharacterJournalAPI,
  getCharacterGrowthAPI,
  revertCharacterRevisionAPI,
  startCharacterOutingAPI,
  stopCharacterOutingAPI,
  updateAssistantMemoryAPI,
  updateCharacterJournalAPI,
} from '@/lib/api-client'
import { deferEffectTask } from '@/lib/defer-effect-task'
import type {
  CharacterGrowth,
  StartCharacterOutingRequest,
} from '@/types/character-growth'

/** 写操作的结果：失败带 `i18nKey` 时调用方说人话。 */
export type GrowthWriteResult =
  | { ok: true }
  | { ok: false; error: string; i18nKey?: string }

/**
 * 角色页右栏「最近」（C 第 3 步起；2026-10-28 改版 B）：她的日记、她改了什么、见闻、观点、
 * 出门状态；撤回一条、出门 / 结束（第 ⑤ 步：在外面时每 `pollMs` 悄悄重读一次）、删见闻、改 / 删观点。`cardId` 为空 = 什么都不读；
 * 换角色时调用方用 key 重置。撤回成功后整份重读（左栏那几格也跟着变），其余就地改手里那份。
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

  /** `quiet` = 在外面时的轮询：不亮加载、读不到也不报错。 */
  const reload = useCallback(
    async (quiet = false) => {
      if (!cardId) return
      if (!quiet) setIsLoading(true)
      const result = await getCharacterGrowthAPI(cardId)
      if (!aliveRef.current) return
      setIsLoading(false)
      if (result.success) {
        setGrowth(result.data)
        setError(null)
      } else if (!quiet) {
        setError(result.error)
      }
    },
    [cardId],
  )

  const outingRunning = Boolean(growth?.outing.running)
  useEffect(() => {
    if (!outingRunning) return
    const timer = window.setInterval(() => {
      void reload(true)
    }, CHARACTER_OUTING.pollMs)
    return () => window.clearInterval(timer)
  }, [outingRunning, reload])

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

  /** 出门调查「开始」：回来的那一趟马上当成「正在外面」，之后轮询接手。 */
  const startOuting = useCallback(
    async (input: StartCharacterOutingRequest): Promise<GrowthWriteResult> => {
      if (!cardId) return { ok: false, error: 'No character' }
      const result = await startCharacterOutingAPI(cardId, input)
      if (!aliveRef.current) return { ok: result.success } as GrowthWriteResult
      if (!result.success) {
        return { ok: false, error: result.error, i18nKey: result.i18nKey }
      }
      setGrowth((current) =>
        current
          ? { ...current, outing: { ...current.outing, running: result.data } }
          : current,
      )
      return { ok: true }
    },
    [cardId],
  )

  /** 「结束」：看到的照样留着；收完工轮询会读到这一趟。 */
  const stopOuting = useCallback(async (): Promise<GrowthWriteResult> => {
    if (!cardId) return { ok: false, error: 'No character' }
    const result = await stopCharacterOutingAPI(cardId)
    if (!aliveRef.current) return { ok: result.success } as GrowthWriteResult
    if (!result.success) {
      return { ok: false, error: result.error, i18nKey: result.i18nKey }
    }
    await reload(true)
    return { ok: true }
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

  /** 日记你能改能删（第 ③ 步）。 */
  const editJournal = useCallback(
    (journalId: string, text: string) =>
      write(
        () => updateCharacterJournalAPI(journalId, { text: text.trim() }),
        (current) => ({
          ...current,
          journals: current.journals.map((row) =>
            row.id === journalId ? { ...row, text: text.trim() } : row,
          ),
        }),
      ),
    [write],
  )

  const removeJournal = useCallback(
    (journalId: string) =>
      write(
        () => deleteCharacterJournalAPI(journalId),
        (current) => ({
          ...current,
          journals: current.journals.filter((row) => row.id !== journalId),
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
    startOuting,
    stopOuting,
    removeFinding,
    editOpinion,
    removeOpinion,
    editJournal,
    removeJournal,
  }
}
