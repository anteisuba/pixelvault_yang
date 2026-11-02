import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  mockAuthenticated,
  mockUnauthenticated,
  mockRateLimitAllowed,
  createGET,
  createPUT,
  parseJSON,
} from '@/test/api-helpers'

// ─── Mocks ──────────────────────────────────────────────────────

vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn(),
  updateProfile: vi.fn(),
}))

import { GET, PUT } from '@/app/api/users/me/profile/route'
import { ensureUser, updateProfile } from '@/services/user.service'

const mockEnsureUser = vi.mocked(ensureUser)
const mockUpdateProfile = vi.mocked(updateProfile)

// ─── Fixtures ───────────────────────────────────────────────────

const DB_USER = {
  id: 'db_u_1',
  clerkId: 'clerk_test_user',
  email: 'test@example.com',
  username: 'alice',
  displayName: 'Alice',
  avatarUrl: 'https://r2.example.com/avatar.png',
  avatarStorageKey: null,
  bannerUrl: null,
  bannerStorageKey: null,
  bio: 'Hello!',
  civitaiToken: null,
  isPublic: true,
  isDeleted: false,
  createdAt: new Date(),
  updatedAt: new Date(),
}

// ─── Tests ──────────────────────────────────────────────────────

describe('GET /api/users/me/profile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockRateLimitAllowed()
    mockEnsureUser.mockResolvedValue(DB_USER)
  })

  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()
    const res = await GET(createGET('/api/users/me/profile'))
    expect(res.status).toBe(401)
  })

  it('returns profile data on success', async () => {
    const res = await GET(createGET('/api/users/me/profile'))
    const json = await parseJSON<{ success: boolean; data: unknown }>(res)

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data).toEqual({
      username: 'alice',
      displayName: 'Alice',
      avatarUrl: 'https://r2.example.com/avatar.png',
      bio: 'Hello!',
      isPublic: true,
    })
  })

  it('returns 500 when ensureUser throws', async () => {
    mockEnsureUser.mockRejectedValue(new Error('DB down'))
    const res = await GET(createGET('/api/users/me/profile'))
    const json = await parseJSON<{ success: boolean }>(res)

    expect(res.status).toBe(500)
    expect(json.success).toBe(false)
  })
})

describe('PUT /api/users/me/profile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockRateLimitAllowed()
    mockEnsureUser.mockResolvedValue(DB_USER)
    mockUpdateProfile.mockResolvedValue({ ...DB_USER, displayName: 'Alice W.' })
  })

  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()
    const res = await PUT(
      createPUT('/api/users/me/profile', { displayName: 'x' }),
    )
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid body', async () => {
    const res = await PUT(createPUT('/api/users/me/profile', undefined))
    expect(res.status).toBe(400)
  })

  it('returns updated profile on success', async () => {
    const res = await PUT(
      createPUT('/api/users/me/profile', { displayName: 'Alice W.' }),
    )
    const json = await parseJSON<{
      success: boolean
      data: { displayName: string }
    }>(res)

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data.displayName).toBe('Alice W.')
  })

  it('returns 409 when username is taken', async () => {
    mockUpdateProfile.mockRejectedValue(new Error('Username already taken'))
    const res = await PUT(
      createPUT('/api/users/me/profile', { username: 'bob' }),
    )
    const json = await parseJSON<{ success: boolean; errorCode: string }>(res)

    expect(res.status).toBe(409)
    expect(json.errorCode).toBe('USERNAME_TAKEN')
  })

  it('returns 409 when username is reserved', async () => {
    mockUpdateProfile.mockRejectedValue(new Error('Username is reserved'))
    const res = await PUT(
      createPUT('/api/users/me/profile', { username: 'admin' }),
    )
    const json = await parseJSON<{ success: boolean; errorCode: string }>(res)

    expect(res.status).toBe(409)
    expect(json.errorCode).toBe('USERNAME_RESERVED')
  })
})
