/**
 * ⏹ / 插话的停止接口（回合托管，11-11）：落的是这个人的这一轮的停止标记。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  createPOST,
  mockAuthenticated,
  mockRateLimitAllowed,
  mockUnauthenticated,
} from '@/test/api-helpers'
import { turnStopRequested } from '@/features/assistant/turn-log'

import { POST } from './route'

const PATH = '/api/studio/assistant-operator/stop'

beforeEach(() => {
  vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
  mockRateLimitAllowed()
})

describe('POST /api/studio/assistant-operator/stop', () => {
  it('落下这个人这一轮的停止标记；⛔ 别人的同号轮不受影响', async () => {
    mockAuthenticated('clerk_a')
    const response = await POST(createPOST(PATH, { turnId: 'turn-stop-1' }))
    expect(response.status).toBe(200)
    expect(await turnStopRequested('clerk_a', 'turn-stop-1')).toBe(true)
    expect(await turnStopRequested('clerk_b', 'turn-stop-1')).toBe(false)
  })

  it('没登录：拒', async () => {
    mockUnauthenticated()
    const response = await POST(createPOST(PATH, { turnId: 'turn-stop-2' }))
    expect(response.status).toBe(401)
  })

  it('没有轮号：拒', async () => {
    mockAuthenticated('clerk_a')
    const response = await POST(createPOST(PATH, {}))
    expect(response.status).toBe(400)
  })
})
