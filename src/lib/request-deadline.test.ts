import { describe, it, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'

import {
  mockAuthenticated,
  mockRateLimitAllowed,
  createPOST,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { VERCEL_FUNCTION } from '@/constants/config'
import { createApiRoute } from '@/lib/api-route-factory'
import {
  getRequestTimeLeftMs,
  runWithRequestDeadline,
} from '@/lib/request-deadline'

/** 允许测试本身跑掉的一点时间。 */
const SLACK_MS = 2_000

describe('request deadline', () => {
  it('is null outside a route — callers fall back to their own default', () => {
    expect(getRequestTimeLeftMs()).toBeNull()
  })

  it('counts down from the route maxDuration and survives awaits', async () => {
    await runWithRequestDeadline(30, async () => {
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
      const left = getRequestTimeLeftMs()
      expect(left).toBeLessThanOrEqual(30_000)
      expect(left).toBeGreaterThan(30_000 - SLACK_MS)
    })
    expect(getRequestTimeLeftMs()).toBeNull()
  })

  it('uses the platform default when the route declares no maxDuration', () => {
    runWithRequestDeadline(undefined, () => {
      expect(getRequestTimeLeftMs()).toBeGreaterThan(
        VERCEL_FUNCTION.DEFAULT_MAX_DURATION_S * 1000 - SLACK_MS,
      )
    })
  })
})

describe('route factory sets the deadline from config.maxDuration', () => {
  const schema = z.object({ name: z.string() })

  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockRateLimitAllowed()
  })

  it('handler sees the time left of its own route', async () => {
    const POST = createApiRoute<typeof schema, { left: number | null }>({
      maxDuration: 45,
      schema,
      routeName: 'POST /api/deadline-test',
      handler: async () => ({ left: getRequestTimeLeftMs() }),
    })
    const res = await POST(createPOST('/api/deadline-test', { name: 'a' }))
    const json = await parseJSON<{ data: { left: number } }>(res)
    expect(json.data.left).toBeLessThanOrEqual(45_000)
    expect(json.data.left).toBeGreaterThan(45_000 - SLACK_MS)
  })

  it('falls back to the platform default when the route passes none', async () => {
    const POST = createApiRoute<typeof schema, { left: number | null }>({
      schema,
      routeName: 'POST /api/deadline-test',
      handler: async () => ({ left: getRequestTimeLeftMs() }),
    })
    const res = await POST(createPOST('/api/deadline-test', { name: 'a' }))
    const json = await parseJSON<{ data: { left: number } }>(res)
    expect(json.data.left).toBeGreaterThan(
      VERCEL_FUNCTION.DEFAULT_MAX_DURATION_S * 1000 - SLACK_MS,
    )
  })
})
