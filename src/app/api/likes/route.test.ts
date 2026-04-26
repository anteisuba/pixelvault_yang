import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  mockAuthenticated,
  mockUnauthenticated,
  createGET,
  createPOST,
  parseJSON,
  FAKE_DB_USER,
} from '@/test/api-helpers'

vi.mock('server-only', () => ({}))

vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn(),
}))

vi.mock('@/services/like.service', () => ({
  toggleLike: vi.fn(),
  getUserLikes: vi.fn(),
}))

import { GET, POST } from './route'
import { ensureUser } from '@/services/user.service'
import { toggleLike, getUserLikes } from '@/services/like.service'

const mockEnsureUser = vi.mocked(ensureUser)
const mockToggleLike = vi.mocked(toggleLike)
const mockGetUserLikes = vi.mocked(getUserLikes)

const VALID_BODY = { generationId: 'gen_123' }
const FAKE_TOGGLE_RESULT = { liked: true, likeCount: 11 }

beforeEach(() => {
  vi.clearAllMocks()
  mockAuthenticated()
  mockEnsureUser.mockResolvedValue(FAKE_DB_USER)
  mockToggleLike.mockResolvedValue(FAKE_TOGGLE_RESULT)
  mockGetUserLikes.mockResolvedValue(new Set(['gen_123']) as never)
})

describe('GET /api/likes', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()

    const res = await GET(createGET('/api/likes', { ids: 'gen_123' }))
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(401)
    expect(body.success).toBe(false)
    expect(mockGetUserLikes).not.toHaveBeenCalled()
  })

  it('returns 400 when ids query parameter is missing', async () => {
    const res = await GET(createGET('/api/likes'))
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(mockGetUserLikes).not.toHaveBeenCalled()
  })

  it('returns liked ids for the authenticated user', async () => {
    const res = await GET(createGET('/api/likes', { ids: 'gen_123,gen_456' }))
    const body = await parseJSON<{
      success: boolean
      data: { likedIds: string[] }
    }>(res)

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.likedIds).toEqual(['gen_123'])
    expect(mockEnsureUser).toHaveBeenCalledWith('clerk_test_user')
    expect(mockGetUserLikes).toHaveBeenCalledWith(FAKE_DB_USER.id, [
      'gen_123',
      'gen_456',
    ])
  })
})

describe('POST /api/likes', () => {
  it('returns 400 for invalid body', async () => {
    const res = await POST(createPOST('/api/likes', {}))
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(mockToggleLike).not.toHaveBeenCalled()
  })

  it('toggles like for the authenticated user', async () => {
    const res = await POST(createPOST('/api/likes', VALID_BODY))
    const body = await parseJSON<{ success: boolean; data: unknown }>(res)

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toEqual(FAKE_TOGGLE_RESULT)
    expect(mockToggleLike).toHaveBeenCalledWith(
      FAKE_DB_USER.id,
      VALID_BODY.generationId,
    )
  })
})
