'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import {
  createMcpTokenAPI,
  listMcpTokensAPI,
  revokeMcpTokenAPI,
} from '@/lib/api-client'
import { deferEffectTask } from '@/lib/defer-effect-task'
import type { CreatedMcpToken, McpTokenRecord } from '@/types/mcp'

/**
 * 设置页「连接」的令牌读写（`docs/references/mcp.md` §3.1）。
 *
 * 形状照抄 `use-assistant-memories.ts`（同一套 `deferEffectTask` + `aliveRef`）。
 * ⚠ 生成回来的明文 `token` 只交给调用方当场展示，⛔ 不进 `tokens` 列表：列表里
 * 永远只有名字与末 4 位，明文离开那张卡就再也拿不到。
 */

/** 最近一次失败落在哪一步；`limit` = 有效令牌已满（服务端 409）。 */
export type McpTokensFailure = 'load' | 'create' | 'limit' | 'revoke'

const HTTP_CONFLICT = 409

export interface UseMcpTokensValue {
  tokens: McpTokenRecord[]
  isLoading: boolean
  failure: McpTokensFailure | null
  /** 生成一个；成功后列表最前多一行（不带明文），明文只在返回值里。 */
  create(name: string): Promise<CreatedMcpToken | null>
  /** 吊销，立即生效。 */
  revoke(tokenId: string): Promise<boolean>
  reload(): Promise<void>
}

export function useMcpTokens(): UseMcpTokensValue {
  const [tokens, setTokens] = useState<McpTokenRecord[]>([])
  /** 首次取回之前就是「在读」：⛔ 不在第一帧闪一下空态。 */
  const [isLoading, setIsLoading] = useState(true)
  const [failure, setFailure] = useState<McpTokensFailure | null>(null)
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  const reload = useCallback(async () => {
    setIsLoading(true)
    const result = await listMcpTokensAPI()
    if (!aliveRef.current) return
    setIsLoading(false)
    if (result.success && result.data) {
      setTokens(result.data)
      setFailure(null)
      return
    }
    setFailure('load')
  }, [])

  // ⚠ 走 `deferEffectTask`：effect 体里不许同步启动会 setState 的活。
  useEffect(
    () =>
      deferEffectTask(() => {
        void reload()
      }),
    [reload],
  )

  const create = useCallback(async (name: string) => {
    const result = await createMcpTokenAPI({ name })
    if (!aliveRef.current) return result.success ? (result.data ?? null) : null
    if (result.success && result.data) {
      const { id, name: savedName, last4, createdAt, lastUsedAt } = result.data
      setTokens((current) => [
        { id, name: savedName, last4, createdAt, lastUsedAt },
        ...current,
      ])
      setFailure(null)
      return result.data
    }
    setFailure(result.status === HTTP_CONFLICT ? 'limit' : 'create')
    return null
  }, [])

  const revoke = useCallback(async (tokenId: string) => {
    const result = await revokeMcpTokenAPI(tokenId)
    if (!aliveRef.current) return result.success
    if (result.success) {
      setTokens((current) => current.filter((token) => token.id !== tokenId))
      setFailure(null)
      return true
    }
    setFailure('revoke')
    return false
  }, [])

  return { tokens, isLoading, failure, create, revoke, reload }
}
