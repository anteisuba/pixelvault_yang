import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  mockAuthenticated,
  mockUnauthenticated,
  createGET,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const mockList = vi.fn()
vi.mock('@/services/inspiration.service', () => ({
  listInspirations: (...args: unknown[]) => mockList(...args),
}))

import { GET } from '@/app/api/inspiration/route'

const FAKE_INSPIRATION = {
  id: 'insp_1',
  source: 'meigen',
  rank: 1,
  prompt: 'A technical infographic of a futuristic device',
  author: 'TechieBySA',
  authorName: 'TechieSA',
  likes: 100,
  views: 5000,
  imageUrl: 'https://images.meigen.ai/tweets/1/0.jpg',
  modelHint: 'gptimage',
  categories: ['UI & Graphic'],
  sourceUrl: 'https://x.com/TechieBySA/status/1',
  rating: 3,
  score: 67.76,
  publishedAt: new Date('2026-02-01').toISOString(),
  isPublic: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

describe('GET /api/inspiration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockList.mockResolvedValue({ inspirations: [FAKE_INSPIRATION], total: 1 })
  })

  it('responds without requiring authentication', async () => {
    mockUnauthenticated()
    const req = createGET('/api/inspiration')
    const res = await GET(req)
    expect(res.status).toBe(200)
  })

  it('returns the inspiration list and total on success', async () => {
    mockAuthenticated()
    const req = createGET('/api/inspiration')
    const res = await GET(req)
    const body = await parseJSON<{
      success: boolean
      data: { inspirations: (typeof FAKE_INSPIRATION)[]; total: number }
    }>(res)

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.inspirations).toHaveLength(1)
    expect(body.data.total).toBe(1)
  })

  it('passes parsed query params to the service with defaults', async () => {
    const req = createGET('/api/inspiration')
    await GET(req)
    expect(mockList).toHaveBeenCalledWith(
      expect.objectContaining({
        sortBy: 'rank',
        limit: 24,
        offset: 0,
      }),
    )
  })

  it('forwards category, query, sortBy, limit, offset', async () => {
    const req = createGET('/api/inspiration', {
      category: 'UI & Graphic',
      query: 'infographic',
      sortBy: 'likes',
      limit: '12',
      offset: '24',
    })
    await GET(req)
    expect(mockList).toHaveBeenCalledWith({
      category: 'UI & Graphic',
      query: 'infographic',
      sortBy: 'likes',
      limit: 12,
      offset: 24,
    })
  })

  it('returns 400 for an invalid sortBy value', async () => {
    const req = createGET('/api/inspiration', { sortBy: 'random' })
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it('sets a public Cache-Control header for CDN caching', async () => {
    const req = createGET('/api/inspiration')
    const res = await GET(req)
    expect(res.headers.get('Cache-Control')).toMatch(/public/)
  })
})
