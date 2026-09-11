'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import {
  addContextCardImageAPI,
  createContextCardAPI,
  deleteContextCardAPI,
  listContextCardsAPI,
  removeContextCardImageAPI,
  updateContextCardAPI,
} from '@/lib/api-client'
import { deferEffectTask } from '@/lib/defer-effect-task'
import type {
  ContextCardKindId,
  ContextCardStatusId,
} from '@/constants/context-cards'
import type {
  AddContextCardImageRequest,
  ContextCard,
  CreateContextCardRequest,
  UpdateContextCardRequest,
} from '@/types/context-cards'

/**
 * **上下文卡**的读写（第三期 K1）。
 *
 * 形状照抄 `use-project-rules.ts`（同一套 `deferEffectTask` + `aliveRef` 约定）。
 *
 * ⚠ 每一次写都用**服务端回来的那一份**替换本地那一张，⛔ 不在客户端自己拼一份
 * 乐观值：常挂开关是服务端读改写的（另一个工作台可能刚挂上），本地拼出来的
 * `pinnedScopes` 与库里的不是同一份。
 */

export interface UseContextCardsValue {
  cards: ContextCard[]
  isLoading: boolean
  error: string | null
  create(input: CreateContextCardRequest): Promise<ContextCard | null>
  update(
    cardId: string,
    input: UpdateContextCardRequest,
  ): Promise<ContextCard | null>
  remove(cardId: string): Promise<boolean>
  /** 常挂 / 取消常挂到一个域 —— 服务端原子切一格。 */
  setPinned(
    cardId: string,
    scope: string,
    pinned: boolean,
  ): Promise<ContextCard | null>
  addImage(
    cardId: string,
    input: AddContextCardImageRequest,
  ): Promise<ContextCard | null>
  removeImage(cardId: string, url: string): Promise<ContextCard | null>
  reload(): Promise<void>
}

export function useContextCards(
  options: {
    kind?: ContextCardKindId
    /** ⚠ 缺席 = 只要已确认的。待确认区传 `proposed`（v2 §8.1）。 */
    status?: ContextCardStatusId
    pinnedScope?: string
    enabled?: boolean
  } = {},
): UseContextCardsValue {
  const { kind, status, pinnedScope } = options
  const enabled = options.enabled ?? true
  const [cards, setCards] = useState<ContextCard[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  const reload = useCallback(async () => {
    setIsLoading(true)
    const result = await listContextCardsAPI({
      ...(kind ? { kind } : {}),
      ...(status ? { status } : {}),
      ...(pinnedScope ? { pinnedScope } : {}),
    })
    if (!aliveRef.current) return
    setIsLoading(false)
    if (result.success) {
      setCards(result.data)
      setError(null)
      return
    }
    setError(result.error)
  }, [kind, status, pinnedScope])

  /**
   * ⚠ 走 `deferEffectTask`：React 19 的 lint 不允许在 effect 体里同步启动会
   * setState 的活（`react-hooks/set-state-in-effect`）。⛔ 别在这里另发明一套。
   */
  useEffect(() => {
    if (!enabled) return
    return deferEffectTask(() => {
      void reload()
    })
  }, [enabled, reload])

  /** 服务端回来的那一份就地替换 —— 找不到就当成新的插到最前（列表按最近改过排序）。 */
  const absorb = useCallback((card: ContextCard) => {
    setCards((current) => {
      const index = current.findIndex((entry) => entry.id === card.id)
      if (index < 0) return [card, ...current]
      const next = [...current]
      next[index] = card
      return next
    })
    setError(null)
  }, [])

  const create = useCallback(
    async (input: CreateContextCardRequest) => {
      const result = await createContextCardAPI(input)
      if (!aliveRef.current) return result.success ? result.data : null
      if (result.success) {
        absorb(result.data)
        return result.data
      }
      setError(result.error)
      return null
    },
    [absorb],
  )

  const update = useCallback(
    async (cardId: string, input: UpdateContextCardRequest) => {
      const result = await updateContextCardAPI(cardId, input)
      if (!aliveRef.current) return result.success ? result.data : null
      if (result.success) {
        absorb(result.data)
        return result.data
      }
      setError(result.error)
      return null
    },
    [absorb],
  )

  const remove = useCallback(async (cardId: string) => {
    const result = await deleteContextCardAPI(cardId)
    if (!aliveRef.current) return result.success
    if (result.success) {
      setCards((current) => current.filter((card) => card.id !== cardId))
      setError(null)
      return true
    }
    setError(result.error)
    return false
  }, [])

  const setPinned = useCallback(
    async (cardId: string, scope: string, pinned: boolean) =>
      update(cardId, { pin: { scope, pinned } }),
    [update],
  )

  const addImage = useCallback(
    async (cardId: string, input: AddContextCardImageRequest) => {
      const result = await addContextCardImageAPI(cardId, input)
      if (!aliveRef.current) return result.success ? result.data : null
      if (result.success) {
        absorb(result.data)
        return result.data
      }
      setError(result.error)
      return null
    },
    [absorb],
  )

  const removeImage = useCallback(
    async (cardId: string, url: string) => {
      const result = await removeContextCardImageAPI(cardId, url)
      if (!aliveRef.current) return result.success ? result.data : null
      if (result.success) {
        absorb(result.data)
        return result.data
      }
      setError(result.error)
      return null
    },
    [absorb],
  )

  return {
    cards,
    isLoading,
    error,
    create,
    update,
    remove,
    setPinned,
    addImage,
    removeImage,
    reload,
  }
}
