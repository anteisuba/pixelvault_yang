import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createGET, parseJSON } from '@/test/api-helpers'

vi.mock('@/services/arena.service', () => ({
  getArenaLeaderboard: vi.fn(),
}))

import { getArenaLeaderboard } from '@/services/arena.service'
import { GET } from './route'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/arena/leaderboard', () => {
  it('returns leaderboard data (no auth required)', async () => {
    const leaderboardData = [
      { modelId: 'sdxl', modelName: 'SDXL', wins: 42, losses: 10, elo: 1250 },
      {
        modelId: 'dall-e-3',
        modelName: 'DALL-E 3',
        wins: 30,
        losses: 20,
        elo: 1180,
      },
    ]
    vi.mocked(getArenaLeaderboard).mockResolvedValue(leaderboardData)

    const res = await GET()

    expect(res.status).toBe(200)
    const body = await parseJSON(res)
    expect(body).toEqual({ success: true, data: leaderboardData })
    expect(getArenaLeaderboard).toHaveBeenCalledOnce()
  })

  it('returns empty array when no data', async () => {
    vi.mocked(getArenaLeaderboard).mockResolvedValue([])

    const res = await GET()

    expect(res.status).toBe(200)
    const body = await parseJSON(res)
    expect(body).toEqual({ success: true, data: [] })
  })

  it('returns 500 when service throws', async () => {
    vi.mocked(getArenaLeaderboard).mockRejectedValue(new Error('Service error'))

    const res = await GET()

    expect(res.status).toBe(500)
    const body = await parseJSON(res)
    expect(body).toEqual({ success: false, error: 'Service error' })
  })
})
