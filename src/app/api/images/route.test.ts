import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  mockAuthenticated,
  mockUnauthenticated,
  createGET,
  parseJSON,
  FAKE_DB_USER,
  FAKE_GENERATION,
} from '@/test/api-helpers'

// ─── Mocks ────────────────────────────────────────────────────────

vi.mock('@/services/generation.service', () => ({
  getPublicGenerations: vi.fn(),
  countPublicGenerations: vi.fn(),
}))

vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn(),
}))

import { GET } from '@/app/api/images/route'
import {
  getPublicGenerations,
  countPublicGenerations,
} from '@/services/generation.service'
import { ensureUser } from '@/services/user.service'

const mockGetPublic = vi.mocked(getPublicGenerations)
const mockCountPublic = vi.mocked(countPublicGenerations)
const mockEnsureUser = vi.mocked(ensureUser)

// ─── Tests ────────────────────────────────────────────────────────

describe('GET /api/images', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetPublic.mockResolvedValue([FAKE_GENERATION as never])
    mockCountPublic.mockResolvedValue(1)
  })

  it('returns public generations with default pagination', async () => {
    const req = createGET('/api/images')
    const res = await GET(req)
    const json = await parseJSON<{
      success: boolean
      data: {
        generations: unknown[]
        page: number
        limit: number
        total: number
        hasMore: boolean
      }
    }>(res)

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data.generations).toHaveLength(1)
    expect(json.data.page).toBe(1)
    expect(json.data.limit).toBe(20)
    expect(json.data.total).toBe(1)
    expect(json.data.hasMore).toBe(false)
    expect(mockGetPublic).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 20 }),
    )
  })

  it('supports search/model/type/sort filters', async () => {
    const req = createGET('/api/images', {
      search: 'sunset',
      model: 'sdxl',
      type: 'image',
      sort: 'oldest',
      page: '2',
      limit: '10',
    })
    const res = await GET(req)
    const json = await parseJSON<{ success: boolean }>(res)

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(mockGetPublic).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'sunset',
        model: 'sdxl',
        type: 'image',
        sort: 'oldest',
        page: 2,
        limit: 10,
      }),
    )
  })

  it('returns 400 for invalid query parameters', async () => {
    const req = createGET('/api/images', { page: '-1' })
    const res = await GET(req)
    const json = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(400)
    expect(json.success).toBe(false)
    expect(json.error).toBe('Invalid query parameters')
  })

  it('returns 401 when mine=1 and unauthenticated', async () => {
    mockUnauthenticated()
    const req = createGET('/api/images', { mine: '1' })
    const res = await GET(req)
    const json = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(401)
    expect(json.success).toBe(false)
    expect(json.error).toBe('Unauthorized')
  })

  it('returns user own generations when mine=1', async () => {
    mockAuthenticated()
    mockEnsureUser.mockResolvedValue(FAKE_DB_USER as never)
    const req = createGET('/api/images', { mine: '1' })
    const res = await GET(req)
    const json = await parseJSON<{
      success: boolean
      data: { generations: unknown[] }
    }>(res)

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(mockGetPublic).toHaveBeenCalledWith(
      expect.objectContaining({ userId: FAKE_DB_USER.id }),
    )
  })

  it('returns 500 when service throws', async () => {
    mockGetPublic.mockRejectedValue(new Error('DB down'))
    const req = createGET('/api/images')
    const res = await GET(req)
    const json = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(500)
    expect(json.success).toBe(false)
    expect(json.error).toBe('Failed to fetch gallery')
  })
})
