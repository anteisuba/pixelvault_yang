'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import {
  decideMcpGenerationRequestAPI,
  listMcpGenerationRequestsAPI,
} from '@/lib/api-client'
import { deferEffectTask } from '@/lib/defer-effect-task'
import {
  MCP_FOLLOW_POLL_IDLE_MS,
  type McpGenerationDecision,
} from '@/constants/mcp'
import type { McpGenerationRequestRecord } from '@/types/mcp'

/**
 * 设置页「连接」上方那一列「等你确认」（`docs/references/mcp.md` §4.4）：外部 AI 发起、
 * 它的客户端弹不了确认框的出图，在这里由她亲自点。开着页就每隔一阵问一次，AI 刚发起的也能等到。
 */
export interface UseMcpGenerationRequestsValue {
  requests: McpGenerationRequestRecord[]
  /** 正在定的那一条（键上转圈，⛔ 连点两下）。 */
  deciding: string | null
  failed: boolean
  decide(requestId: string, decision: McpGenerationDecision): Promise<boolean>
}

export function useMcpGenerationRequests(): UseMcpGenerationRequestsValue {
  const [requests, setRequests] = useState<McpGenerationRequestRecord[]>([])
  const [deciding, setDeciding] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  const reload = useCallback(async () => {
    const result = await listMcpGenerationRequestsAPI()
    if (aliveRef.current && result.success && result.data)
      setRequests(result.data)
  }, [])

  useEffect(
    () =>
      deferEffectTask(() => {
        void reload()
      }),
    [reload],
  )

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void reload()
    }, MCP_FOLLOW_POLL_IDLE_MS)
    return () => window.clearInterval(timer)
  }, [reload])

  const decide = useCallback(
    async (requestId: string, decision: McpGenerationDecision) => {
      setDeciding(requestId)
      const result = await decideMcpGenerationRequestAPI(requestId, {
        decision,
      })
      if (!aliveRef.current) return result.success
      setDeciding(null)
      setFailed(!result.success)
      // 成败都把这一条拿掉：定过 / 过期的不会再回到列表里。
      if (result.success || result.status === 404)
        setRequests((current) =>
          current.filter((request) => request.id !== requestId),
        )
      return result.success
    },
    [],
  )

  return { requests, deciding, failed, decide }
}
