import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  mockAuthenticated,
  mockUnauthenticated,
  createPATCH,
  parseJSON,
  FAKE_DB_USER,
} from '@/test/api-helpers'

// ─── Mocks ────────────────────────────────────────────────────────

vi.mock('@/services/generation.service', () => ({
  toggleGenerationVisibility: vi.fn(),
}))

vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn(),
}))

import { PATCH } from '@/app/api/generations/[id]/visibility/route'
import { toggleGenerationVisibility } from '@/services/generation.service'
import { ensureUser } from '@/services/user.service'

const mockToggle = vi.mocked(toggleGenerationVisibility)
const mockEnsureUser = vi.mocked(ensureUser)

// ─── Helpers ──────────────────────────────────────────────────────

const routeParams = (id: string) => ({
  params: Promise.resolve({ id }),
})

// ─── Tests ────────────────────────────────────────────────────────

describe('PATCH /api/generations/[id]/visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockEnsureUser.mockResolvedValue(FAKE_DB_USER as never)
    mockToggle.mockResolvedValue({
      id: 'gen_123',
      isPublic: false,
      isPromptPublic: false,
    })
  })

  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()
    const req = createPATCH('/api/generations/gen_123/visibility')
    const res = await PATCH(req, routeParams('gen_123'))
    const json = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(401)
    expect(json.success).toBe(false)
    expect(json.error).toBe('Unauthorized')
  })

  it('returns 404 when generation not found or not owned', async () => {
    mockToggle.mockResolvedValue(null)
    const req = createPATCH('/api/generations/gen_999/visibility')
    const res = await PATCH(req, routeParams('gen_999'))
    const json = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(404)
    expect(json.success).toBe(false)
    expect(json.error).toBe('Generation not found or access denied')
  })

  it('returns toggled visibility on success', async () => {
    mockToggle.mockResolvedValue({
      id: 'gen_123',
      isPublic: false,
      isPromptPublic: false,
    })
    const req = createPATCH('/api/generations/gen_123/visibility')
    const res = await PATCH(req, routeParams('gen_123'))
    const json = await parseJSON<{
      success: boolean
      data: { id: string; isPublic: boolean }
    }>(res)

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data).toEqual({
      id: 'gen_123',
      isPublic: false,
      isPromptPublic: false,
    })
    expect(mockToggle).toHaveBeenCalledWith(
      'gen_123',
      FAKE_DB_USER.id,
      'isPublic',
    )
  })

  it('passes isPromptPublic field when specified in body', async () => {
    mockToggle.mockResolvedValue({
      id: 'gen_123',
      isPublic: true,
      isPromptPublic: true,
    })
    const req = new Request(
      new URL('/api/generations/gen_123/visibility', 'http://localhost:3000'),
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: 'isPromptPublic' }),
      },
    )
    const res = await PATCH(req, routeParams('gen_123'))
    const json = await parseJSON<{
      success: boolean
      data: { id: string; isPublic: boolean; isPromptPublic: boolean }
    }>(res)

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(mockToggle).toHaveBeenCalledWith(
      'gen_123',
      FAKE_DB_USER.id,
      'isPromptPublic',
    )
  })

  it('defaults to isPublic when body has invalid field', async () => {
    const req = new Request(
      new URL('/api/generations/gen_123/visibility', 'http://localhost:3000'),
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: 'somethingElse' }),
      },
    )
    await PATCH(req, routeParams('gen_123'))

    expect(mockToggle).toHaveBeenCalledWith(
      'gen_123',
      FAKE_DB_USER.id,
      'isPublic',
    )
  })
})
