import 'server-only'

import { randomUUID } from 'node:crypto'
import { after } from 'next/server'

import { ASSISTANT_OPERATOR_EVENTS } from '@/constants/assistant-operator'
import type {
  AssistantOperatorEvent,
  AssistantOperatorRequest,
} from '@/types/assistant-operator'
import { toAssistantOperatorSseResponse } from '@/lib/assistant-operator-stream'
import { ASSISTANT_TURN_LOG } from '@/features/assistant/constants'
import { relayTurnIdOf, runAssistantNext } from '@/features/assistant/kernel'
import {
  appendTurnEvent,
  clearActiveTurn,
  isLoggedTurnEvent,
  isRelayStop,
  markActiveTurn,
  markTurnRunning,
  turnStopRequested,
  writeTurnDraft,
} from '@/features/assistant/turn-log'

/**
 * 助手一轮的响应（路由只做鉴权与校验，剩下交这里）。
 *
 * ⭐ 回合托管开着（服务端环境变量 `ASSISTANT_DETACHED_TURNS=true`，11-11；⛔ `NEXT_PUBLIC_`：
 *   前端看 `open` 帧里有没有轮号就知道开没开）：
 *  · 轮号由这里定（接力那一跳沿用接力条上的号），写进 `open` 帧；
 *  · 浏览器断开 ⛔ 中止这一轮：它交给 `after()` 跑到自己的停点，只认停止标记（每秒查一次）；
 *  · 每帧写进事件日志（`turn-log.ts`），正在写的那段话每秒存一次草稿；
 *  · 这段会话「在跑的轮」开跑写、收尾删 —— 停在接力点（`time_budget` / `canvas_sync`）的⛔ 删：
 *    还有下一跳要接，回来的页面要找得到它。
 * 关着时与以前逐字相同：浏览器一断就停，不写日志。
 */
export function assistantTurnResponse({
  clerkId,
  request,
  signal,
  routeName,
}: {
  clerkId: string
  request: AssistantOperatorRequest
  signal: AbortSignal
  routeName: string
}): Response {
  if (process.env.ASSISTANT_DETACHED_TURNS !== 'true')
    return toAssistantOperatorSseResponse({
      routeName,
      signal,
      events: (runSignal) =>
        runAssistantNext(clerkId, request, { signal: runSignal }),
    })

  const turnId = relayTurnIdOf(request) ?? randomUUID()
  const conversationId = request.conversationId ?? null
  const stop = new AbortController()
  const poll = setInterval(() => {
    void turnStopRequested(clerkId, turnId).then((requested) => {
      if (requested) stop.abort()
    })
  }, ASSISTANT_TURN_LOG.stopPollMs)
  void markTurnRunning(clerkId, turnId, true)
  if (conversationId)
    void markActiveTurn(
      clerkId,
      conversationId,
      turnId,
      request.turnAnchor ?? null,
    )

  let draft = ''
  let draftSavedAt = 0
  let last: AssistantOperatorEvent | null = null

  return toAssistantOperatorSseResponse({
    routeName,
    turnId,
    detach: {
      stop: stop.signal,
      keepAlive: (run) => {
        const settled = run.finally(async () => {
          clearInterval(poll)
          await writeTurnDraft(clerkId, turnId, null)
          await markTurnRunning(clerkId, turnId, false)
          if (conversationId && !isRelayStop(last))
            await clearActiveTurn(clerkId, conversationId, turnId)
        })
        try {
          after(settled)
        } catch {
          // 不在请求作用域里（脚本 / 测试）：这一轮照样跑，只是没人替它续命。
        }
      },
    },
    onEvent: async (event) => {
      last = event
      if (event.type === ASSISTANT_OPERATOR_EVENTS.messageDelta) {
        draft = event.restart ? event.delta : draft + event.delta
        if (Date.now() - draftSavedAt >= ASSISTANT_TURN_LOG.draftWriteMs) {
          draftSavedAt = Date.now()
          await writeTurnDraft(clerkId, turnId, draft)
        }
        return
      }
      if (event.type === ASSISTANT_OPERATOR_EVENTS.message) {
        draft = ''
        await writeTurnDraft(clerkId, turnId, null)
      }
      if (isLoggedTurnEvent(event))
        await appendTurnEvent(clerkId, turnId, event)
    },
    events: (runSignal) =>
      runAssistantNext(clerkId, request, { signal: runSignal, turnId }),
  })
}
