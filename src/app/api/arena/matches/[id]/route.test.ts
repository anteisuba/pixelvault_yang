import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  mockAuthenticated,
  mockUnauthenticated,
  createGET,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('@/services/arena.service', () => ({
  getArenaMatch: vi.fn(),
}))

import type { ArenaMatchRecord } from '@/types'
import { getArenaMatch } from '@/services/arena.service'
import { GET } from './route'

beforeEach(() => {
  vi.clearAllMocks()
})

const MATCH_ID = 'match_abc123'
const makeParams = (id: string) => ({ params: Promise.resolve({ id }) })

describe('GET /api/arena/matches/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()
    const req = createGET(`/api/arena/matches/${MATCH_ID}`)
    const res = await GET(req, makeParams(MATCH_ID))

    expect(res.status).toBe(401)
    const body = await parseJSON(res)
    expect(body).toEqual({ success: false, error: 'Unauthorized' })
  })

  it('returns match data on success', async () => {
    mockAuthenticated()
    const matchData = {
      id: MATCH_ID,
      prompt: 'a sunset',
      aspectRatio: '1:1',
      winnerId: null,
      votedAt: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      entries: [],
    } as unknown as ArenaMatchRecord
    vi.mocked(getArenaMatch).mockResolvedValue(matchData)

    const req = createGET(`/api/arena/matches/${MATCH_ID}`)
    const res = await GET(req, makeParams(MATCH_ID))

    expect(res.status).toBe(200)
    const body = await parseJSON(res)
    expect(body).toEqual({ success: true, data: matchData })
    expect(getArenaMatch).toHaveBeenCalledWith(MATCH_ID, 'clerk_test_user')
  })

  it('returns 404 when match not found', async () => {
    mockAuthenticated()
    vi.mocked(getArenaMatch).mockResolvedValue(null)

    const req = createGET(`/api/arena/matches/${MATCH_ID}`)
    const res = await GET(req, makeParams(MATCH_ID))

    expect(res.status).toBe(404)
    const body = await parseJSON(res)
    expect(body).toEqual({ success: false, error: 'Match not found' })
  })

  it('returns 500 when service throws', async () => {
    mockAuthenticated()
    vi.mocked(getArenaMatch).mockRejectedValue(new Error('DB error'))

    const req = createGET(`/api/arena/matches/${MATCH_ID}`)
    const res = await GET(req, makeParams(MATCH_ID))

    expect(res.status).toBe(500)
    const body = await parseJSON(res)
    expect(body).toEqual({ success: false, error: 'Failed to fetch match.' })
  })
})
