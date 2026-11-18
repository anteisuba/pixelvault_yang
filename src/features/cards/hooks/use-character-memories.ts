'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import {
  createCharacterMemoryAPI,
  deleteAssistantMemoryAPI,
  getCharacterMemoriesAPI,
  updateAssistantMemoryAPI,
} from '@/lib/api-client'
import { deferEffectTask } from '@/lib/defer-effect-task'
import type { AssistantMemory } from '@/types/assistant-memory'
import type { CharacterMemoryList } from '@/types/character-growth'

/** 写操作的结果：失败带 `i18nKey` 时调用方说人话。 */
export type MemoryWriteResult =
  | { ok: true }
  | { ok: false; error: string; i18nKey?: string }

function takeRow(
  list: CharacterMemoryList | null,
  memoryId: string,
): {
  shelf: 'remembered' | 'dormant'
  index: number
  row: AssistantMemory
} | null {
  if (!list) return null
  for (const shelf of ['remembered', 'dormant'] as const) {
    const index = list[shelf].findIndex((row) => row.id === memoryId)
    const row = list[shelf][index]
    if (row) return { shelf, index, row }
  }
  return null
}

/**
 * 她页「记忆」栏（角色大项目第 ⑦ 步）：记得的 · 沉睡的（见闻的删除归 `useCharacterGrowth`）；记一条、改、钉住、唤醒、删。
 * 改 / 钉住就地换手里那一条；记一条、唤醒、删完整份重读（会有别的条跟着睡 / 醒）。
 * `cardId` 为空 = 什么都不读；换角色时调用方用 key 重置。
 */
export function useCharacterMemories(cardId: string | null) {
  const [list, setList] = useState<CharacterMemoryList | null>(null)
  const [isLoading, setIsLoading] = useState(Boolean(cardId))
  const [error, setError] = useState<string | null>(null)
  const aliveRef = useRef(true)
  /** 删之前那一刻手里的（删失败时原位放回要知道它在哪一栏第几条）。 */
  const listRef = useRef(list)

  useEffect(() => {
    listRef.current = list
  }, [list])

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  const reload = useCallback(async () => {
    if (!cardId) return
    setIsLoading(true)
    const result = await getCharacterMemoriesAPI(cardId)
    if (!aliveRef.current) return
    setIsLoading(false)
    if (result.success) {
      setList(result.data)
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

  const settle = useCallback(
    async (
      result:
        | { success: true }
        | { success: false; error: string; i18nKey?: string },
      after: () => Promise<void> | void,
    ): Promise<MemoryWriteResult> => {
      if (!aliveRef.current) return { ok: result.success } as MemoryWriteResult
      if (!result.success)
        return { ok: false, error: result.error, i18nKey: result.i18nKey }
      await after()
      return { ok: true }
    },
    [],
  )

  const replace = useCallback((memory: AssistantMemory) => {
    setList((current) =>
      current
        ? {
            ...current,
            remembered: current.remembered.map((row) =>
              row.id === memory.id ? memory : row,
            ),
          }
        : current,
    )
  }, [])

  const add = useCallback(
    async (text: string) => {
      if (!cardId) return { ok: false, error: 'No character' } as const
      return settle(await createCharacterMemoryAPI(cardId, text.trim()), reload)
    },
    [cardId, reload, settle],
  )

  const edit = useCallback(
    async (memoryId: string, text: string) => {
      const result = await updateAssistantMemoryAPI(memoryId, {
        text: text.trim(),
      })
      return settle(result, () => {
        if (result.success) replace(result.data)
      })
    },
    [replace, settle],
  )

  const setPinned = useCallback(
    async (memoryId: string, pinned: boolean) => {
      const result = await updateAssistantMemoryAPI(memoryId, { pinned })
      return settle(result, () => {
        if (result.success) replace(result.data)
      })
    },
    [replace, settle],
  )

  const wake = useCallback(
    async (memoryId: string) =>
      settle(await updateAssistantMemoryAPI(memoryId, { wake: true }), reload),
    [reload, settle],
  )

  /**
   * 删：先从手里拿掉（乐观），删失败再原位放回（调用方提示）。
   * ⚠ 以前等请求回来才拿掉：确认框一关那条还在原地 3–6 秒，像没点上（11-18）。
   */
  const remove = useCallback(async (memoryId: string) => {
    const taken = takeRow(listRef.current, memoryId)
    setList((current) =>
      current
        ? {
            ...current,
            remembered: current.remembered.filter((row) => row.id !== memoryId),
            dormant: current.dormant.filter((row) => row.id !== memoryId),
          }
        : current,
    )
    const result = await deleteAssistantMemoryAPI(memoryId)
    if (result.success) return { ok: true } as const
    if (aliveRef.current && taken) {
      const { shelf, index, row } = taken
      setList((current) => {
        if (!current || current[shelf].some((item) => item.id === row.id))
          return current
        const rows = [...current[shelf]]
        rows.splice(Math.min(index, rows.length), 0, row)
        return { ...current, [shelf]: rows }
      })
    }
    return { ok: false, error: result.error, i18nKey: result.i18nKey } as const
  }, [])

  return {
    list,
    isLoading,
    error,
    reload,
    add,
    edit,
    setPinned,
    wake,
    remove,
  }
}
