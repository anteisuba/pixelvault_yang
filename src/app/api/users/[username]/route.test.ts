import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Mocks ──────────────────────────────────────────────────────

const mockAuth = vi.fn<() => Promise<{ userId: string | null }>>()

vi.mock('@clerk/nextjs/server', () => ({
  auth: () => mockAuth(),
}))

vi.mock('@/services/user.service', () => ({
  getCreatorProfile: vi.fn(),
  getUserByClerkId: vi.fn(),
}))

import { GET } from '@/app/api/users/[username]/route'
import { getCreatorProfile, getUserByClerkId } from '@/services/user.service'

const mockGetCreatorProfile = vi.mocked(getCreatorProfile)
const mockGetUserByClerkId = vi.mocked(getUserByClerkId)

// ─── Fixtures ───────────────────────────────────────────────────

const PUBLIC_PROFILE = {
  username: 'alice',
  displayName: 'Alice',
  avatarUrl: 'https://r2.example.com/alice.png',
  bannerUrl: null,
  bio: 'Hello!',
  isPublic: true,
  createdAt: new Date(),
  publicImageCount: 10,
  likeCount: 50,
  followerCount: 5,
  followingCount: 3,
  generations: [],
  total: 10,
  hasMore: false,
  userId: 'db_alice',
  viewerRelation: { isFollowing: false, isOwnProfile: false },
}

const PRIVATE_PROFILE = {
  private: true as const,
  username: 'secret_user',
  displayName: 'Secret',
  avatarUrl: null,
}

// ─── Helpers ────────────────────────────────────────────────────

function createRequest(username: string, query?: Record<string, string>) {
  const url = new URL(`http://localhost:3000/api/users/${username}`)
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      url.searchParams.set(k, v)
    }
  }
  return new NextRequest(url)
}

function makeParams(username: string) {
  return { params: Promise.resolve({ username }) }
}

// ─── Tests ──────────────────────────────────────────────────────

describe('GET /api/users/[username]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ userId: null })
    mockGetUserByClerkId.mockResolvedValue(null)
  })

  it('returns 200 with public profile', async () => {
    mockGetCreatorProfile.mockResolvedValue(PUBLIC_PROFILE)

    const res = await GET(createRequest('alice'), makeParams('alice'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data.username).toBe('alice')
    expect(json.data.publicImageCount).toBe(10)
  })

  it('returns 404 when profile not found', async () => {
    mockGetCreatorProfile.mockResolvedValue(null)

    const res = await GET(createRequest('nobody'), makeParams('nobody'))
    const json = await res.json()

    expect(res.status).toBe(404)
    expect(json.success).toBe(false)
  })

  it('returns 403 for private profile with limited data', async () => {
    mockGetCreatorProfile.mockResolvedValue(PRIVATE_PROFILE)

    const res = await GET(
      createRequest('secret_user'),
      makeParams('secret_user'),
    )
    const json = await res.json()

    expect(res.status).toBe(403)
    expect(json.success).toBe(false)
    expect(json.error).toBe('private')
    expect(json.data.username).toBe('secret_user')
    expect(json.data).not.toHaveProperty('bio')
  })

  it('passes viewer userId when authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_viewer' })
    mockGetUserByClerkId.mockResolvedValue({ id: 'db_viewer' } as never)
    mockGetCreatorProfile.mockResolvedValue(PUBLIC_PROFILE)

    await GET(createRequest('alice'), makeParams('alice'))

    expect(mockGetCreatorProfile).toHaveBeenCalledWith(
      'alice',
      'db_viewer',
      1,
      expect.any(Number),
    )
  })

  it('returns 500 when service throws', async () => {
    mockGetCreatorProfile.mockRejectedValue(new Error('DB error'))

    const res = await GET(createRequest('alice'), makeParams('alice'))
    const json = await res.json()

    expect(res.status).toBe(500)
    expect(json.success).toBe(false)
  })
})
