import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  createGET,
  mockAuthenticated,
  mockUnauthenticated,
} from '@/test/api-helpers'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { mockRateLimit, mockIsOwnedStorageUrl } = vi.hoisted(() => ({
  mockRateLimit: vi.fn(),
  mockIsOwnedStorageUrl: vi.fn(),
}))

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: mockRateLimit,
}))

vi.mock('@/services/storage/r2', () => ({
  isOwnedStorageUrl: mockIsOwnedStorageUrl,
}))

import { GET } from './route'

beforeEach(() => {
  vi.clearAllMocks()
  mockRateLimit.mockResolvedValue({ success: true })
})

describe('GET /api/image/proxy', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()
    const res = await GET(
      createGET('/api/image/proxy', { url: 'https://example.com/x.png' }),
    )
    expect(res.status).toBe(401)
  })

  it('302-redirects same-origin R2 URLs without fetching upstream', async () => {
    mockAuthenticated()
    mockIsOwnedStorageUrl.mockReturnValue(true)
    const fetchSpy = vi.spyOn(global, 'fetch')

    const res = await GET(
      createGET('/api/image/proxy', {
        url: 'https://cdn.anteisuba.com/generations/u1/x.png',
      }),
    )

    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(
      'https://cdn.anteisuba.com/generations/u1/x.png',
    )
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('proxies external URLs through the lambda (no redirect)', async () => {
    mockAuthenticated()
    mockIsOwnedStorageUrl.mockReturnValue(false)
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response('payload', {
        status: 200,
        headers: { 'content-type': 'image/png' },
      }),
    )

    const res = await GET(
      createGET('/api/image/proxy', {
        url: 'https://example.com/external.png',
      }),
    )

    expect(res.status).toBe(200)
    expect(fetchSpy).toHaveBeenCalledOnce()
    fetchSpy.mockRestore()
  })

  it('rejects disallowed protocols before redirecting', async () => {
    mockAuthenticated()
    mockIsOwnedStorageUrl.mockReturnValue(true)

    const res = await GET(
      createGET('/api/image/proxy', { url: 'http://internal/x.png' }),
    )

    expect(res.status).toBe(400)
  })
})
