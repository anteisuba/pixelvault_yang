import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  mockAuthenticated,
  mockUnauthenticated,
  createGET,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('@/services/arena.service', () => ({
  getArenaHistory: vi.fn(),
}))

import { getArenaHistory } from '@/services/arena.service'
import { GET } from './route'

const mockGetArenaHistory = vi.mocked(getArenaHistory)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/arena/history', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()
    const req = createGET('/api/arena/history')
    const res = await GET(req)

    expect(res.status).toBe(401)
    const body = await parseJSON(res)
    expect(body).toMatchObject({ success: false })
  })

  it('returns match history on success', async () => {
    mockAuthenticated()
    const historyData = {
      matches: [
        {
          id: 'match_1',
          prompt: 'a cat',
          aspectRatio: '1:1',
          winnerId: 'entry_1',
          votedAt: '2026-03-20T10:00:00.000Z',
          createdAt: '2026-03-20T09:50:00.000Z',
          entries: [
            {
              id: 'entry_1',
              modelId: 'sdxl',
              slotIndex: 0,
              wasVoted: true,
              imageUrl: 'https://example.com/img1.png',
            },
            {
              id: 'entry_2',
              modelId: 'flux-2-pro',
              slotIndex: 1,
              wasVoted: false,
              imageUrl: 'https://example.com/img2.png',
            },
          ],
        },
      ],
      total: 1,
      hasMore: false,
    }
    mockGetArenaHistory.mockResolvedValue(historyData)

    const req = createGET('/api/arena/history', { page: '1' })
    const res = await GET(req)

    expect(res.status).toBe(200)
    const body = await parseJSON(res)
    expect(body).toEqual({ success: true, data: historyData })
    expect(mockGetArenaHistory).toHaveBeenCalledWith('clerk_test_user', 1, 20)
  })

  it('respects page and limit params', async () => {
    mockAuthenticated()
    mockGetArenaHistory.mockResolvedValue({
      matches: [],
      total: 0,
      hasMore: false,
    })

    const req = createGET('/api/arena/history', { page: '3', limit: '10' })
    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(mockGetArenaHistory).toHaveBeenCalledWith('clerk_test_user', 3, 10)
  })

  it('returns 500 when service throws', async () => {
    mockAuthenticated()
    mockGetArenaHistory.mockRejectedValue(new Error('DB error'))

    const req = createGET('/api/arena/history')
    const res = await GET(req)

    expect(res.status).toBe(500)
    const body = await parseJSON(res)
    expect(body).toMatchObject({ success: false })
  })
})
