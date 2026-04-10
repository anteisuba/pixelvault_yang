import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  mockAuthenticated,
  mockUnauthenticated,
  mockRateLimitAllowed,
  createPOST,
  parseJSON,
  FAKE_DB_USER,
} from '@/test/api-helpers'

// ─── Mocks ────────────────────────────────────────────────────────

vi.mock('@/services/generation.service', () => ({
  selectVariantWinner: vi.fn(),
}))

vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn(),
}))

import { POST } from '@/app/api/studio/select-winner/route'
import { selectVariantWinner } from '@/services/generation.service'
import { ensureUser } from '@/services/user.service'

const mockSelectWinner = vi.mocked(selectVariantWinner)
const mockEnsureUser = vi.mocked(ensureUser)

// ─── Tests ────────────────────────────────────────────────────────

describe('POST /api/studio/select-winner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockRateLimitAllowed()
    mockEnsureUser.mockResolvedValue(FAKE_DB_USER as never)
    mockSelectWinner.mockResolvedValue(undefined)
  })

  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()
    const req = createPOST('/api/studio/select-winner', {
      runGroupId: 'group_1',
      generationId: 'gen_1',
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid body', async () => {
    const req = createPOST('/api/studio/select-winner', {
      runGroupId: '',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns success when winner is selected', async () => {
    const req = createPOST('/api/studio/select-winner', {
      runGroupId: 'group_1',
      generationId: 'gen_1',
    })
    const res = await POST(req)
    const json = await parseJSON<{ success: boolean }>(res)

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(mockSelectWinner).toHaveBeenCalledWith(
      FAKE_DB_USER.id,
      'group_1',
      'gen_1',
    )
  })

  it('returns 500 when service throws', async () => {
    mockSelectWinner.mockRejectedValue(
      new Error('Generation not found or not part of this run group'),
    )
    const req = createPOST('/api/studio/select-winner', {
      runGroupId: 'group_1',
      generationId: 'gen_999',
    })
    const res = await POST(req)
    expect(res.status).toBe(500)
  })
})
