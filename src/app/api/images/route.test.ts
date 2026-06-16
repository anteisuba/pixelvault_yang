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
  getPublicGenerationPage: vi.fn(),
  getAnonymousPublicGalleryPage: vi.fn(),
}))

vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn(),
}))

import { GET } from '@/app/api/images/route'
import {
  getPublicGenerationPage,
  getAnonymousPublicGalleryPage,
} from '@/services/generation.service'
import { ensureUser } from '@/services/user.service'

const mockGetPublicPage = vi.mocked(getPublicGenerationPage)
const mockGetAnonPage = vi.mocked(getAnonymousPublicGalleryPage)
const mockEnsureUser = vi.mocked(ensureUser)

// ─── Tests ────────────────────────────────────────────────────────

describe('GET /api/images', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetPublicPage.mockResolvedValue({
      generations: [FAKE_GENERATION as never],
      total: 1,
      hasMore: false,
      nextCursor: null,
    })
    mockGetAnonPage.mockResolvedValue({
      generations: [FAKE_GENERATION as never],
      total: 1,
      hasMore: false,
      nextCursor: null,
    })
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
        nextCursor: string | null
      }
    }>(res)

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data.generations).toHaveLength(1)
    expect(json.data.page).toBe(1)
    expect(json.data.limit).toBe(20)
    expect(json.data.total).toBe(1)
    expect(json.data.hasMore).toBe(false)
    expect(json.data.nextCursor).toBeNull()
    // Anonymous public path goes through the cached helper, not the raw service.
    expect(mockGetAnonPage).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 20 }),
    )
    expect(mockGetPublicPage).not.toHaveBeenCalled()
  })

  it('supports search/model/type/sort filters', async () => {
    const req = createGET('/api/images', {
      search: 'sunset',
      model: 'gemini-3.1-flash-image-preview',
      type: 'image',
      sort: 'oldest',
      page: '2',
      limit: '10',
    })
    const res = await GET(req)
    const json = await parseJSON<{ success: boolean }>(res)

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(mockGetAnonPage).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'sunset',
        model: 'gemini-3.1-flash-image-preview',
        type: 'image',
        sort: 'oldest',
        page: 2,
        limit: 10,
      }),
    )
  })

  it('passes cursor pagination through to the service', async () => {
    mockGetAnonPage.mockResolvedValueOnce({
      generations: [FAKE_GENERATION as never],
      total: null,
      hasMore: true,
      nextCursor: 'gen-next',
    })
    const req = createGET('/api/images', {
      cursor: 'gen-cursor',
      limit: '10',
    })
    const res = await GET(req)
    const json = await parseJSON<{
      success: boolean
      data: {
        total: number | null
        hasMore: boolean
        nextCursor: string | null
      }
    }>(res)

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data.total).toBeNull()
    expect(json.data.hasMore).toBe(true)
    expect(json.data.nextCursor).toBe('gen-next')
    expect(mockGetAnonPage).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: 'gen-cursor', limit: 10 }),
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
    expect(mockGetPublicPage).toHaveBeenCalledWith(
      expect.objectContaining({ userId: FAKE_DB_USER.id }),
    )
  })

  it('supports owner-scoped published assets filter', async () => {
    mockAuthenticated()
    mockEnsureUser.mockResolvedValue(FAKE_DB_USER as never)
    const req = createGET('/api/images', { mine: '1', published: '1' })
    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(mockGetPublicPage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: FAKE_DB_USER.id,
        published: true,
      }),
    )
  })

  it('returns 500 when service throws', async () => {
    mockUnauthenticated()
    mockGetAnonPage.mockReset()
    mockGetAnonPage.mockRejectedValueOnce(new Error('DB down'))
    const req = createGET('/api/images')
    const res = await GET(req)
    const json = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(500)
    expect(json.success).toBe(false)
    expect(json.error).toBe('Failed to fetch gallery')
  })
})
