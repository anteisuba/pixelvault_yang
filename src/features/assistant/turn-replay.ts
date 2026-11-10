import 'server-only'

import { ASSISTANT_OPERATOR_EVENTS } from '@/constants/assistant-operator'
import type { AssistantOperatorEvent } from '@/types/assistant-operator'
import { toAssistantOperatorSseResponse } from '@/lib/assistant-operator-stream'
import { ASSISTANT_TURN_LOG } from '@/features/assistant/constants'
import {
  isRelayStop,
  readTurnDraft,
  readTurnEvents,
  turnRunning,
} from '@/features/assistant/turn-log'

/**
 * 回来的页面**接回一轮**（回合托管第 3 片，`docs/references/assistant-durable-turns.md` §3）。
 *
 * ⭐ 出的流与实时那条同形（同一个成帧器、同一个 `open` 帧、同样的心跳）：页面用同一套事件处理，
 *   接力、确认卡、应用照旧。
 *  · 先把日志里序号 `after` 之后的帧原样发完，再把正在写的那段话作为一次「换掉重写」的增量发出；
 *  · 这一轮还有一跳在跑就每秒再看一次：新帧照发，草稿变了再发；
 *  · 到终态（`done` / `error` / 非接力的 `stopped`）就收。
 *  · 停在接力点、而下一跳没在跑：收 —— 由回来的页面接着发下一跳（它看到的正是这一帧）。
 *  · 没有一跳在跑、日志也没到终态（那一跳死了）：收，客户端按「缺终态 = 断流」收尾。
 * ⚠ 补放的帧 ⛔ 再进日志：这条流不挂 `onEvent`。
 */
export function assistantTurnReplayResponse({
  clerkId,
  turnId,
  after,
  signal,
  routeName,
}: {
  clerkId: string
  turnId: string
  after: number
  signal: AbortSignal
  routeName: string
}): Response {
  return toAssistantOperatorSseResponse({
    routeName,
    signal,
    turnId,
    events: (runSignal) => replayTurnEvents(clerkId, turnId, after, runSignal),
  })
}

export async function* replayTurnEvents(
  owner: string,
  turnId: string,
  after: number,
  signal: AbortSignal,
  options: { pollMs?: number; budgetMs?: number } = {},
): AsyncGenerator<AssistantOperatorEvent> {
  const pollMs = options.pollMs ?? ASSISTANT_TURN_LOG.replayPollMs
  const deadline =
    Date.now() + (options.budgetMs ?? ASSISTANT_TURN_LOG.replayBudgetMs)
  let seq = after
  let draft: string | null = null

  while (!signal.aborted) {
    for (const logged of await readTurnEvents(owner, turnId, seq)) {
      seq = logged.seq
      yield logged.event
      if (logged.event.type === ASSISTANT_OPERATOR_EVENTS.message) draft = null
      if (isFinalEvent(logged.event)) return
    }
    if (!(await turnRunning(owner, turnId))) {
      /**
       * 这一跳刚收尾：它在清「在跑」之前已经把所有帧写完（成帧器等日志写完才结束），
       * 但上面那次读可能早于最后几帧 —— 再读一遍尾巴再收。
       */
      for (const logged of await readTurnEvents(owner, turnId, seq)) {
        yield logged.event
        if (isFinalEvent(logged.event)) return
      }
      return
    }
    const current = await readTurnDraft(owner, turnId)
    if (current && current !== draft) {
      draft = current
      yield {
        type: ASSISTANT_OPERATOR_EVENTS.messageDelta,
        delta: current,
        restart: true,
      }
    }
    if (Date.now() + pollMs >= deadline) return
    await wait(pollMs, signal)
  }
}

/**
 * 这一帧之后这一轮不会再有帧。接力点（`time_budget` / `canvas_sync`）不算：下一跳还会接着写
 * 同一份日志。⚠ 开台（`bench_open`）算：那一跳换到别的台、别的页面去接，补放不跟过去。
 */
function isFinalEvent(event: AssistantOperatorEvent): boolean {
  return (
    event.type === ASSISTANT_OPERATOR_EVENTS.done ||
    event.type === ASSISTANT_OPERATOR_EVENTS.error ||
    (event.type === ASSISTANT_OPERATOR_EVENTS.stopped && !isRelayStop(event))
  )
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms)
    function done() {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
    signal.addEventListener('abort', done, { once: true })
  })
}
