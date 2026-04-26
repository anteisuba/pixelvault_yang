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

vi.mock('@/services/apiKey.service', () => ({
  verifyApiKey: vi.fn(),
}))

import { POST } from './route'
import { ensureUser } from '@/services/user.service'
import { verifyApiKey } from '@/services/apiKey.service'

const mockEnsureUser = vi.mocked(ensureUser)
const mockVerifyApiKey = vi.mocked(verifyApiKey)

const KEY_ID = 'key_abc'
const routeParams = { params: Promise.resolve({ id: KEY_ID }) }

const FAKE_VERIFY_RESULT = {
  id: KEY_ID,
  status: 'available' as const,
  latencyMs: 32,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuthenticated()
  mockEnsureUser.mockResolvedValue(FAKE_DB_USER)
  mockVerifyApiKey.mockResolvedValue(FAKE_VERIFY_RESULT)
})

describe('POST /api/api-keys/[id]/verify', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()

    const res = await POST(
      createPOST(`/api/api-keys/${KEY_ID}/verify`, {}),
      routeParams,
    )
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(401)
    expect(body.success).toBe(false)
    expect(mockVerifyApiKey).not.toHaveBeenCalled()
  })

  it('returns 400 for invalid JSON body', async () => {
    const res = await POST(
      createPOST(`/api/api-keys/${KEY_ID}/verify`, undefined),
      routeParams,
    )
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(mockVerifyApiKey).not.toHaveBeenCalled()
  })

  it('verifies the API key for the authenticated user', async () => {
    const res = await POST(
      createPOST(`/api/api-keys/${KEY_ID}/verify`, {}),
      routeParams,
    )
    const body = await parseJSON<{ success: boolean; data: unknown }>(res)

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toEqual(FAKE_VERIFY_RESULT)
    expect(mockEnsureUser).toHaveBeenCalledWith('clerk_test_user')
    expect(mockVerifyApiKey).toHaveBeenCalledWith(KEY_ID, FAKE_DB_USER.id)
  })

  it('returns 403 when verification is denied by the service', async () => {
    mockVerifyApiKey.mockRejectedValue(new Error('access denied'))

    const res = await POST(
      createPOST(`/api/api-keys/${KEY_ID}/verify`, {}),
      routeParams,
    )
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(403)
    expect(body.success).toBe(false)
  })
})
