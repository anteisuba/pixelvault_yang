import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  appendTurnEvent,
  clearActiveTurn,
  isLoggedTurnEvent,
  markActiveTurn,
  readActiveTurn,
  readTurnDraft,
  readTurnEvents,
  requestTurnStop,
  turnStopRequested,
  writeTurnDraft,
} from './turn-log'

/** 没配 Upstash：走进程内存（开发 / 测试）。每条用例换一个轮号，互不串。 */
let turn = 0
const nextTurn = () => `turn-${(turn += 1)}`

beforeEach(() => {
  vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
})

describe('回合事件日志（回合托管第 1 片）', () => {
  it('按到达顺序编号，按序号之后补读', async () => {
    const id = nextTurn()
    expect(
      await appendTurnEvent('user-a', id, { type: 'message', text: '一' }),
    ).toBe(1)
    expect(
      await appendTurnEvent('user-a', id, { type: 'message', text: '二' }),
    ).toBe(2)
    expect(await appendTurnEvent('user-a', id, { type: 'done' })).toBe(3)

    expect(await readTurnEvents('user-a', id, 0)).toEqual([
      { seq: 1, event: { type: 'message', text: '一' } },
      { seq: 2, event: { type: 'message', text: '二' } },
      { seq: 3, event: { type: 'done' } },
    ])
    expect(await readTurnEvents('user-a', id, 2)).toEqual([
      { seq: 3, event: { type: 'done' } },
    ])
  })

  it('⛔ 别人的同号轮读不到', async () => {
    const id = nextTurn()
    await appendTurnEvent('user-a', id, { type: 'done' })
    expect(await readTurnEvents('user-b', id, 0)).toEqual([])
  })

  it('增量不进日志：正文增量、带摘要的思考；只带秒数的思考进', () => {
    expect(isLoggedTurnEvent({ type: 'message_delta', delta: '在' })).toBe(
      false,
    )
    expect(isLoggedTurnEvent({ type: 'thinking', delta: '想' })).toBe(false)
    expect(isLoggedTurnEvent({ type: 'thinking', ms: 1200 })).toBe(true)
    expect(isLoggedTurnEvent({ type: 'message', text: '好' })).toBe(true)
  })

  it('草稿：写了能读，写 null 就删', async () => {
    const id = nextTurn()
    await writeTurnDraft('user-a', id, '正在写的')
    expect(await readTurnDraft('user-a', id)).toBe('正在写的')
    await writeTurnDraft('user-a', id, null)
    expect(await readTurnDraft('user-a', id)).toBeNull()
  })

  it('在跑的轮：⛔ 被旧一轮收尾抹掉新一轮的号', async () => {
    const older = nextTurn()
    const newer = nextTurn()
    await markActiveTurn('user-a', 'conv-1', older)
    await markActiveTurn('user-a', 'conv-1', newer)
    await clearActiveTurn('user-a', 'conv-1', older)
    expect(await readActiveTurn('user-a', 'conv-1')).toBe(newer)
    await clearActiveTurn('user-a', 'conv-1', newer)
    expect(await readActiveTurn('user-a', 'conv-1')).toBeNull()
  })

  it('停止标记只停这一个人的这一轮', async () => {
    const id = nextTurn()
    expect(await turnStopRequested('user-a', id)).toBe(false)
    await requestTurnStop('user-a', id)
    expect(await turnStopRequested('user-a', id)).toBe(true)
    expect(await turnStopRequested('user-b', id)).toBe(false)
  })
})
