import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  mockAuthenticated,
  mockUnauthenticated,
  createPOST,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('@/services/arena.service', () => ({
  submitArenaVote: vi.fn(),
}))

import { submitArenaVote } from '@/services/arena.service'
import { POST } from './route'

beforeEach(() => {
  vi.clearAllMocks()
})

const MATCH_ID = 'match_abc123'
const makeParams = (id: string) => ({ params: Promise.resolve({ id }) })

describe('POST /api/arena/matches/[id]/vote', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()
    const req = createPOST(`/api/arena/matches/${MATCH_ID}/vote`, {
      winnerEntryId: 'entry_1',
    })
    const res = await POST(req, makeParams(MATCH_ID))

    expect(res.status).toBe(401)
    const body = await parseJSON(res)
    expect(body).toEqual({ success: false, error: 'Unauthorized' })
  })

  it('returns 400 for invalid body', async () => {
    mockAuthenticated()
    const req = createPOST(`/api/arena/matches/${MATCH_ID}/vote`, {
      winnerEntryId: '',
    })
    const res = await POST(req, makeParams(MATCH_ID))

    expect(res.status).toBe(400)
    const body = await parseJSON(res)
    expect(body).toMatchObject({ success: false })
    expect(body).toHaveProperty('error')
  })

  it('returns 400 for missing winnerEntryId', async () => {
    mockAuthenticated()
    const req = createPOST(`/api/arena/matches/${MATCH_ID}/vote`, {})
    const res = await POST(req, makeParams(MATCH_ID))

    expect(res.status).toBe(400)
  })

  it('returns vote result on success', async () => {
    mockAuthenticated()
    const voteResult = {
      matchId: MATCH_ID,
      winnerEntryId: 'entry_1',
      winnerModel: 'sdxl',
      loserModel: 'dall-e-3',
    }
    vi.mocked(submitArenaVote).mockResolvedValue(voteResult)

    const req = createPOST(`/api/arena/matches/${MATCH_ID}/vote`, {
      winnerEntryId: 'entry_1',
    })
    const res = await POST(req, makeParams(MATCH_ID))

    expect(res.status).toBe(200)
    const body = await parseJSON(res)
    expect(body).toEqual({ success: true, data: voteResult })
    expect(submitArenaVote).toHaveBeenCalledWith(
      MATCH_ID,
      'entry_1',
      'clerk_test_user',
    )
  })

  it('returns 500 when service throws', async () => {
    mockAuthenticated()
    vi.mocked(submitArenaVote).mockRejectedValue(new Error('Vote failed'))

    const req = createPOST(`/api/arena/matches/${MATCH_ID}/vote`, {
      winnerEntryId: 'entry_1',
    })
    const res = await POST(req, makeParams(MATCH_ID))

    expect(res.status).toBe(500)
    const body = await parseJSON(res)
    expect(body).toEqual({ success: false, error: 'Vote failed' })
  })
})
