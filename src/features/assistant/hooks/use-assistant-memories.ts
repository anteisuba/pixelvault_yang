'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import type {
  AssistantMemoryScopeId,
  AssistantMemorySourceId,
} from '@/constants/assistant-memory'
import {
  clearAssistantMemoriesAPI,
  createAssistantMemoryAPI,
  deleteAssistantMemoryAPI,
  listAssistantMemoriesAPI,
  updateAssistantMemoryAPI,
} from '@/lib/api-client'
import { deferEffectTask } from '@/lib/defer-effect-task'
import type {
  AssistantMemory,
  CreateAssistantMemoryRequest,
} from '@/types/assistant-memory'

/**
 * **助手记忆**的读写（56a · 助手设置 B 的「记忆」页）。
 *
 * 形状照抄 `use-context-cards.ts`（同一套 `deferEffectTask` + `aliveRef` 约定）。
 *
 * ⚠ **一次全取，筛选在前端**（画板：顶部 chip 纯前端过滤）：一个用户的记忆最多
 * 五个域各 200 条，按域再跑一次请求换来的只是四个 chip 之间的一次白屏。
 * ⚠ 每一次写都用**服务端回来的那一份**替换本地那一条，⛔ 不自己拼乐观值：
 * `updatedAt` 由库决定，而列表就是按它排的。
 */

/** 最近一次失败。`i18nKey` 在时按它说人话（`getApiErrorMessage`），⛔ 不把英文原话递给用户。 */
export interface AssistantMemoriesFailure {
  message: string
  i18nKey?: string
}

function toFailure(result: {
  error: string
  i18nKey?: string
}): AssistantMemoriesFailure {
  return {
    message: result.error,
    ...(result.i18nKey ? { i18nKey: result.i18nKey } : {}),
  }
}

export interface UseAssistantMemoriesValue {
  memories: AssistantMemory[]
  isLoading: boolean
  error: AssistantMemoriesFailure | null
  /** 你写一条：成功后排到最前（最新的在前，与服务端那份排序同一条）。 */
  create(input: CreateAssistantMemoryRequest): Promise<AssistantMemory | null>
  update(
    memoryId: string,
    input: { text?: string; scope?: AssistantMemoryScopeId },
  ): Promise<AssistantMemory | null>
  remove(memoryId: string): Promise<boolean>
  /** 清空（跟着筛选走：缺 `source` = 全部）。 */
  clear(source?: AssistantMemorySourceId): Promise<boolean>
  reload(): Promise<void>
}

export function useAssistantMemories(
  options: { enabled?: boolean } = {},
): UseAssistantMemoriesValue {
  const enabled = options.enabled ?? true
  const [memories, setMemories] = useState<AssistantMemory[]>([])
  /** 首次取回之前就是「在读」：⛔ 不在第一帧闪一下「还没有记忆」。 */
  const [isLoading, setIsLoading] = useState(enabled)
  const [error, setError] = useState<AssistantMemoriesFailure | null>(null)
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  const reload = useCallback(async () => {
    setIsLoading(true)
    const result = await listAssistantMemoriesAPI()
    if (!aliveRef.current) return
    setIsLoading(false)
    if (result.success) {
      setMemories(result.data)
      setError(null)
      return
    }
    setError(toFailure(result))
  }, [])

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

  const create = useCallback(async (input: CreateAssistantMemoryRequest) => {
    const result = await createAssistantMemoryAPI(input)
    if (!aliveRef.current) return result.success ? result.data : null
    if (result.success) {
      // 同一句话已经在了时服务端回的是那一行 —— 先摘掉旧位置再放到最前。
      setMemories((current) => [
        result.data,
        ...current.filter((memory) => memory.id !== result.data.id),
      ])
      setError(null)
      return result.data
    }
    setError(toFailure(result))
    return null
  }, [])

  const update = useCallback(
    async (
      memoryId: string,
      input: { text?: string; scope?: AssistantMemoryScopeId },
    ) => {
      const result = await updateAssistantMemoryAPI(memoryId, input)
      if (!aliveRef.current) return result.success ? result.data : null
      if (result.success) {
        /**
         * ⚠ **就地替换、⛔ 不重排**：改完 `updatedAt` 会前移，按它重排的表现是
         * 用户刚改完那一行就从眼前跳走了。下次进页面时它自然排在最前。
         */
        setMemories((current) =>
          current.map((memory) =>
            memory.id === result.data.id ? result.data : memory,
          ),
        )
        setError(null)
        return result.data
      }
      setError(toFailure(result))
      return null
    },
    [],
  )

  const remove = useCallback(async (memoryId: string) => {
    const result = await deleteAssistantMemoryAPI(memoryId)
    if (!aliveRef.current) return result.success
    if (result.success) {
      setMemories((current) =>
        current.filter((memory) => memory.id !== memoryId),
      )
      setError(null)
      return true
    }
    setError(toFailure(result))
    return false
  }, [])

  const clear = useCallback(async (source?: AssistantMemorySourceId) => {
    const result = await clearAssistantMemoriesAPI(source)
    if (!aliveRef.current) return result.success
    if (result.success) {
      setMemories((current) =>
        source ? current.filter((memory) => memory.source !== source) : [],
      )
      setError(null)
      return true
    }
    setError(toFailure(result))
    return false
  }, [])

  return {
    memories,
    isLoading,
    error,
    create,
    update,
    remove,
    clear,
    reload,
  }
}
