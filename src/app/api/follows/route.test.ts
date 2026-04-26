import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  mockAuthenticated,
  mockUnauthenticated,
  createPOST,
  parseJSON,
  FAKE_DB_USER,
} from '@/test/api-helpers'

vi.mock('server-only', () => ({}))

vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn(),
}))

vi.mock('@/services/follow.service', () => ({
  toggleFollow: vi.fn(),
}))

import { POST } from './route'
import { ensureUser } from '@/services/user.service'
import { toggleFollow } from '@/services/follow.service'

const mockEnsureUser = vi.mocked(ensureUser)
const mockToggleFollow = vi.mocked(toggleFollow)

const VALID_BODY = { targetUserId: 'target_user_123' }
const FAKE_TOGGLE_RESULT = { following: true, followerCount: 7 }

beforeEach(() => {
  vi.clearAllMocks()
  mockAuthenticated()
  mockEnsureUser.mockResolvedValue(FAKE_DB_USER)
  mockToggleFollow.mockResolvedValue(FAKE_TOGGLE_RESULT)
})

describe('POST /api/follows', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()

    const res = await POST(createPOST('/api/follows', VALID_BODY))
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(401)
    expect(body.success).toBe(false)
    expect(mockToggleFollow).not.toHaveBeenCalled()
  })

  it('returns 400 for invalid body', async () => {
    const res = await POST(createPOST('/api/follows', {}))
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(mockToggleFollow).not.toHaveBeenCalled()
  })

  it('toggles follow for the authenticated user', async () => {
    const res = await POST(createPOST('/api/follows', VALID_BODY))
    const body = await parseJSON<{ success: boolean; data: unknown }>(res)

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toEqual(FAKE_TOGGLE_RESULT)
    expect(mockEnsureUser).toHaveBeenCalledWith('clerk_test_user')
    expect(mockToggleFollow).toHaveBeenCalledWith(
      FAKE_DB_USER.id,
      VALID_BODY.targetUserId,
    )
  })

  it('returns 400 for service-level invalid follow errors', async () => {
    mockToggleFollow.mockRejectedValue(new Error('Cannot follow yourself'))

    const res = await POST(createPOST('/api/follows', VALID_BODY))
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
  })
})
