import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  mockAuthenticated,
  mockUnauthenticated,
  createGET,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('@/services/arena.service', () => ({
  getPersonalArenaStats: vi.fn(),
}))

import { getPersonalArenaStats } from '@/services/arena.service'
import { GET } from './route'

const mockGetPersonalArenaStats = vi.mocked(getPersonalArenaStats)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/arena/personal-stats', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()
    const res = await GET(createGET('/api/arena/personal-stats'))

    expect(res.status).toBe(401)
    const body = await parseJSON(res)
    expect(body).toMatchObject({ success: false })
  })

  it('returns personal stats on success', async () => {
    mockAuthenticated()
    const statsData = {
      totalMatches: 10,
      stats: [
        {
          modelId: 'sdxl',
          matchCount: 8,
          winCount: 5,
          winRate: 62.5,
        },
        {
          modelId: 'flux-2-pro',
          matchCount: 6,
          winCount: 3,
          winRate: 50,
        },
      ],
    }
    mockGetPersonalArenaStats.mockResolvedValue(statsData)

    const res = await GET(createGET('/api/arena/personal-stats'))

    expect(res.status).toBe(200)
    const body = await parseJSON(res)
    expect(body).toEqual({ success: true, data: statsData })
    expect(mockGetPersonalArenaStats).toHaveBeenCalledWith('clerk_test_user')
  })

  it('returns empty stats', async () => {
    mockAuthenticated()
    mockGetPersonalArenaStats.mockResolvedValue({
      totalMatches: 0,
      stats: [],
    })

    const res = await GET(createGET('/api/arena/personal-stats'))

    expect(res.status).toBe(200)
    const body = await parseJSON(res)
    expect(body).toEqual({
      success: true,
      data: { totalMatches: 0, stats: [] },
    })
  })

  it('returns 500 when service throws', async () => {
    mockAuthenticated()
    mockGetPersonalArenaStats.mockRejectedValue(new Error('DB error'))

    const res = await GET(createGET('/api/arena/personal-stats'))

    expect(res.status).toBe(500)
    const body = await parseJSON(res)
    expect(body).toMatchObject({ success: false })
  })
})
