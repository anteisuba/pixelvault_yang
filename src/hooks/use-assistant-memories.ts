'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import {
  clearAssistantMemoriesAPI,
  deleteAssistantMemoryAPI,
  listAssistantMemoriesAPI,
  updateAssistantMemoryAPI,
} from '@/lib/api-client'
import { deferEffectTask } from '@/lib/defer-effect-task'
import type { AssistantMemory } from '@/types/assistant-memory'

/**
 * **助手记忆**的读写（56a · `/settings/assistant` 的记忆区）。
 *
 * 形状照抄 `use-context-cards.ts`（同一套 `deferEffectTask` + `aliveRef` 约定）。
 *
 * ⚠ **一次全取，筛选在前端**（画板：顶部 chip 纯前端过滤）：一个用户的记忆最多
 * 五个域各 200 条，按域再跑一次请求换来的只是四个 chip 之间的一次白屏。
 * ⚠ 每一次写都用**服务端回来的那一份**替换本地那一条，⛔ 不自己拼乐观值：
 * `updatedAt` 由库决定，而列表就是按它排的。
 */

export interface UseAssistantMemoriesValue {
  memories: AssistantMemory[]
  isLoading: boolean
  error: string | null
  update(memoryId: string, text: string): Promise<AssistantMemory | null>
  remove(memoryId: string): Promise<boolean>
  clearAll(): Promise<boolean>
  reload(): Promise<void>
}

export function useAssistantMemories(
  options: { enabled?: boolean } = {},
): UseAssistantMemoriesValue {
  const enabled = options.enabled ?? true
  const [memories, setMemories] = useState<AssistantMemory[]>([])
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
    const result = await listAssistantMemoriesAPI()
    if (!aliveRef.current) return
    setIsLoading(false)
    if (result.success) {
      setMemories(result.data)
      setError(null)
      return
    }
    setError(result.error)
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

  const update = useCallback(async (memoryId: string, text: string) => {
    const result = await updateAssistantMemoryAPI(memoryId, text)
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
    setError(result.error)
    return null
  }, [])

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
    setError(result.error)
    return false
  }, [])

  const clearAll = useCallback(async () => {
    const result = await clearAssistantMemoriesAPI()
    if (!aliveRef.current) return result.success
    if (result.success) {
      setMemories([])
      setError(null)
      return true
    }
    setError(result.error)
    return false
  }, [])

  return { memories, isLoading, error, update, remove, clearAll, reload }
}
