import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  mockAuthenticated,
  mockUnauthenticated,
  mockRateLimitAllowed,
  createPOST,
  parseJSON,
} from '@/test/api-helpers'

// ─── Mocks ──────────────────────────────────────────────────────

vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn(),
  uploadAvatar: vi.fn(),
}))

import { POST } from '@/app/api/users/me/avatar/route'
import { ensureUser, uploadAvatar } from '@/services/user.service'

const mockEnsureUser = vi.mocked(ensureUser)
const mockUploadAvatar = vi.mocked(uploadAvatar)

// ─── Fixtures ───────────────────────────────────────────────────

const DB_USER = {
  id: 'db_u_1',
  clerkId: 'clerk_test_user',
  email: 'test@example.com',
  username: 'alice',
  displayName: 'Alice',
  avatarUrl: null,
  avatarStorageKey: null,
  bannerUrl: null,
  bannerStorageKey: null,
  bio: null,
  civitaiToken: null,
  isPublic: true,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const VALID_BODY = { imageData: 'data:image/png;base64,abc123' }

// ─── Tests ──────────────────────────────────────────────────────

describe('POST /api/users/me/avatar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockRateLimitAllowed()
    mockEnsureUser.mockResolvedValue(DB_USER)
    mockUploadAvatar.mockResolvedValue({
      url: 'https://r2.example.com/new-avatar.png',
    })
  })

  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()
    const res = await POST(createPOST('/api/users/me/avatar', VALID_BODY))
    expect(res.status).toBe(401)
  })

  it('returns 400 for missing imageData', async () => {
    const res = await POST(createPOST('/api/users/me/avatar', {}))
    expect(res.status).toBe(400)
  })

  it('returns 200 with new avatar url on success', async () => {
    const res = await POST(createPOST('/api/users/me/avatar', VALID_BODY))
    const json = await parseJSON<{ success: boolean; data: { url: string } }>(
      res,
    )

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data.url).toBe('https://r2.example.com/new-avatar.png')
  })

  it('returns 400 when avatar is too large', async () => {
    mockUploadAvatar.mockRejectedValue(new Error('Avatar must be under 5 MB'))
    const res = await POST(createPOST('/api/users/me/avatar', VALID_BODY))
    const json = await parseJSON<{ success: boolean; errorCode: string }>(res)

    expect(res.status).toBe(400)
    expect(json.errorCode).toBe('AVATAR_TOO_LARGE')
  })

  it('returns 400 when image type is unsupported', async () => {
    mockUploadAvatar.mockRejectedValue(new Error('Unsupported image type'))
    const res = await POST(createPOST('/api/users/me/avatar', VALID_BODY))
    const json = await parseJSON<{ success: boolean; errorCode: string }>(res)

    expect(res.status).toBe(400)
    expect(json.errorCode).toBe('UNSUPPORTED_IMAGE_TYPE')
  })
})
