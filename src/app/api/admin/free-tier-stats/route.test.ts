import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  mockAuthenticated,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('@/services/generation.service', () => ({
  getFreeTierStats: vi.fn(),
}))

import { GET } from './route'
import { getFreeTierStats } from '@/services/generation.service'

const mockGetFreeTierStats = vi.mocked(getFreeTierStats)

const FAKE_FREE_TIER_STATS = {
  today: 12,
  last7Days: 70,
  last30Days: 240,
  uniqueUsersToday: 8,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetFreeTierStats.mockResolvedValue(FAKE_FREE_TIER_STATS)
})

describe('GET /api/admin/free-tier-stats', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()

    const res = await GET()
    const body = await parseJSON<{ error: string }>(res)

    expect(res.status).toBe(401)
    expect(body).toEqual({ error: 'Unauthorized' })
  })

  it('does not call the stats service when unauthenticated', async () => {
    mockUnauthenticated()

    await GET()

    expect(mockGetFreeTierStats).not.toHaveBeenCalled()
  })

  it('returns free-tier stats with configured limits on success', async () => {
    mockAuthenticated()

    const res = await GET()
    const body = await parseJSON<{
      today: number
      last7Days: number
      last30Days: number
      uniqueUsersToday: number
      dailyPlatformLimit: number
      perUserDailyLimit: number
      enabled: boolean
    }>(res)

    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      ...FAKE_FREE_TIER_STATS,
      dailyPlatformLimit: 500,
    })
    expect(typeof body.perUserDailyLimit).toBe('number')
    expect(typeof body.enabled).toBe('boolean')
    expect(mockGetFreeTierStats).toHaveBeenCalledTimes(1)
  })
})
