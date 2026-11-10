/**
 * 接回一轮（回合托管第 3 片）：补放出的流与实时那条同形 —— 先 `open`（带轮号）再按序号补帧。
 */
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  mockAuthenticated,
  mockRateLimitAllowed,
  mockUnauthenticated,
} from '@/test/api-helpers'
import { readAssistantOperatorStream } from '@/lib/api-client/assistant-operator'
import { appendTurnEvent } from '@/features/assistant/turn-log'
import type { AssistantOperatorEvent } from '@/types/assistant-operator'

import { GET } from './route'

function replay(turnId: string, after?: number) {
  const url = new URL(
    `http://localhost/api/studio/assistant-operator/turns/${turnId}`,
  )
  if (after !== undefined) url.searchParams.set('after', String(after))
  return GET(new NextRequest(url), { params: Promise.resolve({ turnId }) })
}

async function framesOf(response: Response) {
  const events: AssistantOperatorEvent[] = []
  for await (const event of readAssistantOperatorStream(response.body!))
    events.push(event)
  return events
}

beforeEach(() => {
  vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
  mockRateLimitAllowed()
})

describe('GET /api/studio/assistant-operator/turns/[turnId]', () => {
  it('open 帧带轮号，再按序号之后补帧到终态', async () => {
    await appendTurnEvent('clerk_a', 'turn-r-1', {
      type: 'message',
      text: '一',
    })
    await appendTurnEvent('clerk_a', 'turn-r-1', {
      type: 'message',
      text: '二',
    })
    await appendTurnEvent('clerk_a', 'turn-r-1', { type: 'done' })

    mockAuthenticated('clerk_a')
    const response = await replay('turn-r-1', 1)
    expect(response.headers.get('Content-Type')).toContain('text/event-stream')
    expect(await framesOf(response)).toEqual([
      { type: 'open', turnId: 'turn-r-1' },
      { type: 'message', text: '二' },
      { type: 'done' },
    ])
  })

  it('⛔ 别人的同号轮：只有 open，没有帧（客户端按断流收尾）', async () => {
    await appendTurnEvent('clerk_a', 'turn-r-2', { type: 'done' })
    mockAuthenticated('clerk_b')
    const frames = await framesOf(await replay('turn-r-2'))
    expect(frames[0]).toEqual({ type: 'open', turnId: 'turn-r-2' })
    expect(frames.some((event) => event.type === 'done')).toBe(false)
  })

  it('没登录：拒', async () => {
    mockUnauthenticated()
    expect((await replay('turn-r-3')).status).toBe(401)
  })

  it('序号不是数：拒', async () => {
    mockAuthenticated('clerk_a')
    const url = new URL(
      'http://localhost/api/studio/assistant-operator/turns/turn-r-4?after=x',
    )
    const response = await GET(new NextRequest(url), {
      params: Promise.resolve({ turnId: 'turn-r-4' }),
    })
    expect(response.status).toBe(400)
  })
})
