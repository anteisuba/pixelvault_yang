import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createGET,
  mockAuthenticated,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'
import { logger } from '@/lib/logger'

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}))

import { GET } from './route'

const STORAGE_BASE_URL = 'https://cdn.test.com'
const ASSET_URL = `${STORAGE_BASE_URL}/generations/video.mp4`

interface ApiEnvelope {
  success: boolean
  error?: string
}

describe('GET /api/download', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('NEXT_PUBLIC_STORAGE_BASE_URL', STORAGE_BASE_URL)
    vi.stubGlobal('fetch', fetchMock)
    mockAuthenticated()
    fetchMock.mockResolvedValue(
      new Response('asset-body', {
        status: 200,
        headers: { 'Content-Type': 'video/mp4' },
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()
    const req = createGET('/api/download', {
      url: ASSET_URL,
      filename: 'video.mp4',
    })
    const res = await GET(req)
    const body = await parseJSON<ApiEnvelope>(res)

    expect(res.status).toBe(401)
    expect(body.success).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns 400 when url parameter is missing', async () => {
    const req = createGET('/api/download', { filename: 'video.mp4' })
    const res = await GET(req)
    const body = await parseJSON<ApiEnvelope>(res)

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns 403 when url is outside the configured storage base URL', async () => {
    const req = createGET('/api/download', {
      url: 'https://example.com/video.mp4',
      filename: 'video.mp4',
    })
    const res = await GET(req)
    const body = await parseJSON<ApiEnvelope>(res)

    expect(res.status).toBe(403)
    expect(body.success).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('proxies a valid storage asset as an attachment', async () => {
    const req = createGET('/api/download', {
      url: ASSET_URL,
      filename: 'pixelvault-video.mp4',
    })
    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('video/mp4')
    expect(res.headers.get('Content-Disposition')).toBe(
      'attachment; filename="pixelvault-video.mp4"',
    )
    expect(res.headers.get('Cache-Control')).toBe('private, no-cache')
    expect(await res.text()).toBe('asset-body')
    expect(fetchMock).toHaveBeenCalledWith(ASSET_URL)
  })

  it('returns 502 when the upstream asset request fails', async () => {
    fetchMock.mockResolvedValue(
      new Response('not found', {
        status: 404,
        headers: { 'Content-Type': 'text/plain' },
      }),
    )

    const req = createGET('/api/download', {
      url: ASSET_URL,
      filename: 'missing.mp4',
    })
    const res = await GET(req)
    const body = await parseJSON<ApiEnvelope>(res)

    expect(res.status).toBe(502)
    expect(body.success).toBe(false)
    expect(logger.error).toHaveBeenCalledWith(
      'Download proxy upstream failed',
      { url: ASSET_URL, status: 404 },
    )
  })
})
