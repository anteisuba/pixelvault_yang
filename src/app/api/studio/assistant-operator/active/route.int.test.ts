/**
 * 刷新回来先问一句「这段会话还有没有在跑的轮」（回合托管第 3 片）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  createGET,
  mockAuthenticated,
  mockRateLimitAllowed,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'
import { markActiveTurn } from '@/features/assistant/turn-log'

import { GET } from './route'

const PATH = '/api/studio/assistant-operator/active'
const CONVERSATION = '6f1c2a3e-0b4d-4c5e-8f9a-1b2c3d4e5f60'

beforeEach(() => {
  vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
  mockRateLimitAllowed()
})

describe('GET /api/studio/assistant-operator/active', () => {
  it('回这个人这段会话在跑的轮与锚点；⛔ 别人问不出来', async () => {
    await markActiveTurn('clerk_a', CONVERSATION, 'turn-active-1', 'u-3')

    mockAuthenticated('clerk_a')
    const mine = await parseJSON<{ data: { active: unknown } }>(
      await GET(createGET(PATH, { conversationId: CONVERSATION })),
    )
    expect(mine.data.active).toEqual({ turnId: 'turn-active-1', anchor: 'u-3' })

    mockAuthenticated('clerk_b')
    const theirs = await parseJSON<{ data: { active: unknown } }>(
      await GET(createGET(PATH, { conversationId: CONVERSATION })),
    )
    expect(theirs.data.active).toBeNull()
  })

  it('没登录：拒', async () => {
    mockUnauthenticated()
    const response = await GET(
      createGET(PATH, { conversationId: CONVERSATION }),
    )
    expect(response.status).toBe(401)
  })

  it('会话号不是 uuid：拒', async () => {
    mockAuthenticated('clerk_a')
    const response = await GET(createGET(PATH, { conversationId: 'nope' }))
    expect(response.status).toBe(400)
  })
})
