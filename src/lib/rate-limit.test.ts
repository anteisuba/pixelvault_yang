import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRedisLimit = vi.fn()

vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: class Ratelimit {
    static slidingWindow() {
      return {}
    }

    limit(key: string) {
      return mockRedisLimit(key)
    }
  },
}))

vi.mock('@upstash/redis', () => ({
  Redis: class Redis {},
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { rateLimit } from './rate-limit'

describe('rate-limit memory fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRedisLimit.mockRejectedValue(new Error('redis unavailable'))
  })

  it('evicts old keys instead of growing the process store without bound', async () => {
    const config = { limit: 1, windowSeconds: 60 }

    for (let index = 0; index <= 1_000; index += 1) {
      await rateLimit(`fallback-key-${index}`, config)
    }

    await expect(rateLimit('fallback-key-0', config)).resolves.toEqual({
      success: true,
      remaining: 0,
    })
  })
})
