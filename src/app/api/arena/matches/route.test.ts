import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  mockAuthenticated,
  mockUnauthenticated,
  mockRateLimitAllowed,
  createPOST,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('@/services/arena.service', () => ({
  createArenaMatch: vi.fn(),
  getArenaMatch: vi.fn(),
}))

import { createArenaMatch } from '@/services/arena.service'
import { POST } from './route'

beforeEach(() => {
  vi.clearAllMocks()
  mockRateLimitAllowed()
})

describe('POST /api/arena/matches', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()
    const req = createPOST('/api/arena/matches', { prompt: 'test' })
    const res = await POST(req)

    expect(res.status).toBe(401)
    const body = await parseJSON(res)
    expect(body).toEqual({ success: false, error: 'Unauthorized' })
  })

  it('returns 400 for invalid body', async () => {
    mockAuthenticated()
    const req = createPOST('/api/arena/matches', { prompt: '' })
    const res = await POST(req)

    expect(res.status).toBe(400)
    const body = await parseJSON(res)
    expect(body).toMatchObject({ success: false })
    expect(body).toHaveProperty('error')
  })

  it('returns 400 for missing prompt', async () => {
    mockAuthenticated()
    const req = createPOST('/api/arena/matches', {})
    const res = await POST(req)

    expect(res.status).toBe(400)
  })

  it('returns matchId on success', async () => {
    mockAuthenticated()
    vi.mocked(createArenaMatch).mockResolvedValue('match_abc123')

    const req = createPOST('/api/arena/matches', {
      prompt: 'a beautiful sunset',
    })
    const res = await POST(req)

    expect(res.status).toBe(200)
    const body = await parseJSON(res)
    expect(body).toEqual({
      success: true,
      data: { matchId: 'match_abc123' },
    })
    expect(createArenaMatch).toHaveBeenCalledWith('clerk_test_user', {
      prompt: 'a beautiful sunset',
      aspectRatio: '1:1',
      referenceImage: undefined,
    })
  })

  it('returns matchId with custom aspectRatio', async () => {
    mockAuthenticated()
    vi.mocked(createArenaMatch).mockResolvedValue('match_456')

    const req = createPOST('/api/arena/matches', {
      prompt: 'a cat',
      aspectRatio: '16:9',
    })
    const res = await POST(req)

    expect(res.status).toBe(200)
    const body = await parseJSON(res)
    expect(body).toEqual({
      success: true,
      data: { matchId: 'match_456' },
    })
    expect(createArenaMatch).toHaveBeenCalledWith('clerk_test_user', {
      prompt: 'a cat',
      aspectRatio: '16:9',
      referenceImage: undefined,
    })
  })

  it('returns 500 when service throws', async () => {
    mockAuthenticated()
    vi.mocked(createArenaMatch).mockRejectedValue(new Error('DB down'))

    const req = createPOST('/api/arena/matches', {
      prompt: 'a beautiful sunset',
    })
    const res = await POST(req)

    expect(res.status).toBe(500)
    const body = await parseJSON(res)
    expect(body).toEqual({
      success: false,
      error: 'Match creation failed. Please try again.',
    })
  })
})
