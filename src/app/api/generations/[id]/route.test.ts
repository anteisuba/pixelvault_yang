import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  mockAuthenticated,
  mockUnauthenticated,
  createDELETE,
  parseJSON,
  FAKE_DB_USER,
  FAKE_GENERATION,
} from '@/test/api-helpers'

// ─── Mocks ────────────────────────────────────────────────────────

vi.mock('@/services/generation.service', () => ({
  deleteGeneration: vi.fn(),
}))

vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn(),
}))

vi.mock('@/services/storage/r2', () => ({
  deleteFromR2: vi.fn(),
}))

import { DELETE } from '@/app/api/generations/[id]/route'
import { deleteGeneration } from '@/services/generation.service'
import { ensureUser } from '@/services/user.service'
import { deleteFromR2 } from '@/services/storage/r2'

const mockDeleteGen = vi.mocked(deleteGeneration)
const mockEnsureUser = vi.mocked(ensureUser)
const mockDeleteR2 = vi.mocked(deleteFromR2)

// ─── Helpers ──────────────────────────────────────────────────────

const routeParams = (id: string) => ({
  params: Promise.resolve({ id }),
})

// ─── Tests ────────────────────────────────────────────────────────

describe('DELETE /api/generations/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockEnsureUser.mockResolvedValue(FAKE_DB_USER as never)
    mockDeleteGen.mockResolvedValue(FAKE_GENERATION as never)
    mockDeleteR2.mockResolvedValue(undefined)
  })

  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()
    const req = createDELETE('/api/generations/gen_123')
    const res = await DELETE(req, routeParams('gen_123'))
    const json = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(401)
    expect(json.success).toBe(false)
    expect(json.error).toBe('Unauthorized')
  })

  it('returns 404 when generation not found or not owned', async () => {
    mockDeleteGen.mockResolvedValue(null as never)
    const req = createDELETE('/api/generations/gen_999')
    const res = await DELETE(req, routeParams('gen_999'))
    const json = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(404)
    expect(json.success).toBe(false)
    expect(json.error).toBe('Generation not found or access denied')
  })

  it('returns success and calls deleteFromR2', async () => {
    const req = createDELETE('/api/generations/gen_123')
    const res = await DELETE(req, routeParams('gen_123'))
    const json = await parseJSON<{ success: boolean }>(res)

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(mockDeleteGen).toHaveBeenCalledWith('gen_123', FAKE_DB_USER.id)
    expect(mockDeleteR2).toHaveBeenCalledWith(FAKE_GENERATION.storageKey)
  })

  it('still succeeds if R2 cleanup fails', async () => {
    mockDeleteR2.mockRejectedValue(new Error('R2 timeout'))
    const req = createDELETE('/api/generations/gen_123')
    const res = await DELETE(req, routeParams('gen_123'))
    const json = await parseJSON<{ success: boolean }>(res)

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
  })
})
