import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import type { AssistantOperatorEvent } from '@/types/assistant-operator'

import { appendTurnEvent, markTurnRunning, writeTurnDraft } from './turn-log'
import { replayTurnEvents } from './turn-replay'

/** 没配 Upstash：走进程内存。每条用例换一个轮号。 */
let turn = 0
const nextTurn = () => `replay-${(turn += 1)}`

beforeEach(() => {
  vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
})

async function collect(
  iterable: AsyncIterable<AssistantOperatorEvent>,
): Promise<AssistantOperatorEvent[]> {
  const out: AssistantOperatorEvent[] = []
  for await (const event of iterable) out.push(event)
  return out
}

const signal = () => new AbortController().signal

describe('接回一轮的补放（回合托管第 3 片）', () => {
  it('整轮补放到终态就收', async () => {
    const id = nextTurn()
    await appendTurnEvent('u', id, { type: 'message', text: '一' })
    await appendTurnEvent('u', id, { type: 'done' })
    await appendTurnEvent('u', id, { type: 'message', text: '不该到' })
    expect(await collect(replayTurnEvents('u', id, 0, signal()))).toEqual([
      { type: 'message', text: '一' },
      { type: 'done' },
    ])
  })

  it('按序号之后补', async () => {
    const id = nextTurn()
    await appendTurnEvent('u', id, { type: 'message', text: '一' })
    await appendTurnEvent('u', id, { type: 'done' })
    expect(await collect(replayTurnEvents('u', id, 1, signal()))).toEqual([
      { type: 'done' },
    ])
  })

  it('停在接力点、下一跳没在跑：收在接力帧上（页面接着发）', async () => {
    const id = nextTurn()
    await appendTurnEvent('u', id, { type: 'message', text: '一' })
    await appendTurnEvent('u', id, { type: 'stopped', reason: 'canvas_sync' })
    expect(await collect(replayTurnEvents('u', id, 0, signal()))).toEqual([
      { type: 'message', text: '一' },
      { type: 'stopped', reason: 'canvas_sync' },
    ])
  })

  it('非接力的停（等你确认）是终点：后面就算还有帧也 ⛔ 再发', async () => {
    const id = nextTurn()
    await appendTurnEvent('u', id, {
      type: 'stopped',
      reason: 'awaiting_confirm',
    })
    await appendTurnEvent('u', id, { type: 'message', text: '不该到' })
    await markTurnRunning('u', id, true)
    expect(await collect(replayTurnEvents('u', id, 0, signal()))).toEqual([
      { type: 'stopped', reason: 'awaiting_confirm' },
    ])
  })

  it('还有一跳在跑：先发草稿，等到新帧再接着发，收尾后读完尾巴再收', async () => {
    const id = nextTurn()
    await appendTurnEvent('u', id, { type: 'stopped', reason: 'time_budget' })
    await markTurnRunning('u', id, true)
    await writeTurnDraft('u', id, '正在写')

    const seen: AssistantOperatorEvent[] = []
    const replay = (async () => {
      for await (const event of replayTurnEvents('u', id, 0, signal(), {
        pollMs: 5,
      })) {
        seen.push(event)
        if (seen.length === 2) {
          // 下一跳写完最后两帧就收尾（清「在跑」）—— 补放要把它们读到。
          await appendTurnEvent('u', id, { type: 'message', text: '写完了' })
          await appendTurnEvent('u', id, { type: 'done' })
          await markTurnRunning('u', id, false)
        }
      }
    })()
    await replay
    expect(seen).toEqual([
      { type: 'stopped', reason: 'time_budget' },
      { type: 'message_delta', delta: '正在写', restart: true },
      { type: 'message', text: '写完了' },
      { type: 'done' },
    ])
  })

  it('没有一跳在跑、日志也没到终态：照实收（页面按断流收尾）', async () => {
    const id = nextTurn()
    await appendTurnEvent('u', id, { type: 'message', text: '一' })
    expect(await collect(replayTurnEvents('u', id, 0, signal()))).toEqual([
      { type: 'message', text: '一' },
    ])
  })

  it('页面断开：⛔ 再等', async () => {
    const id = nextTurn()
    await markTurnRunning('u', id, true)
    const controller = new AbortController()
    const replay = collect(
      replayTurnEvents('u', id, 0, controller.signal, { pollMs: 50 }),
    )
    controller.abort()
    expect(await replay).toEqual([])
  })

  it('⛔ 别人的同号轮补不出来', async () => {
    const id = nextTurn()
    await appendTurnEvent('u', id, { type: 'done' })
    expect(await collect(replayTurnEvents('other', id, 0, signal()))).toEqual(
      [],
    )
  })
})
