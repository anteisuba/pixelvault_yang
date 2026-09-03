import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createGET,
  mockAuthenticated,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'
import { logger } from '@/lib/logger'
import { DOWNLOAD_URL_TTL_SECONDS } from '@/constants/config'

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}))

const createPresignedR2GetUrl =
  vi.fn<
    (params: {
      key: string
      expiresInSeconds: number
      contentDisposition?: string
    }) => Promise<string>
  >()

vi.mock('@/services/storage/r2', () => ({
  createPresignedR2GetUrl: (params: {
    key: string
    expiresInSeconds: number
    contentDisposition?: string
  }) => createPresignedR2GetUrl(params),
}))

import { GET } from './route'

const STORAGE_BASE_URL = 'https://cdn.test.com'
const ASSET_URL = `${STORAGE_BASE_URL}/generations/video.mp4`
const FAL_ASSET_URL = 'https://v3b.fal.media/files/b/0a9ab613/upscaled.png'
const PRESIGNED_URL =
  'https://account.r2.cloudflarestorage.com/bucket/generations/video.mp4?X-Amz-Signature=abc'

interface ApiEnvelope {
  success: boolean
  error?: string
  data?: { downloadUrl?: string }
}

describe('GET /api/download', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('NEXT_PUBLIC_STORAGE_BASE_URL', STORAGE_BASE_URL)
    vi.stubGlobal('fetch', fetchMock)
    mockAuthenticated()
    createPresignedR2GetUrl.mockResolvedValue(PRESIGNED_URL)
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

  it('returns 403 when url is outside allowed download hosts', async () => {
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

  it('returns 403 for lookalike provider hostnames', async () => {
    const req = createGET('/api/download', {
      url: 'https://fal.media.evil.test/files/image.png',
      filename: 'image.png',
    })
    const res = await GET(req)
    const body = await parseJSON<ApiEnvelope>(res)

    expect(res.status).toBe(403)
    expect(body.success).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns a presigned attachment URL for our own storage asset', async () => {
    const req = createGET('/api/download', {
      url: ASSET_URL,
      filename: 'pixelvault-video.mp4',
    })
    const res = await GET(req)
    const body = await parseJSON<ApiEnvelope>(res)

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data?.downloadUrl).toBe(PRESIGNED_URL)
    expect(createPresignedR2GetUrl).toHaveBeenCalledWith({
      key: 'generations/video.mp4',
      expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS,
      contentDisposition: 'attachment; filename="pixelvault-video.mp4"',
    })
    // The whole point: no bytes pass through the function.
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sanitizes the filename it signs into the disposition', async () => {
    const req = createGET('/api/download', {
      url: ASSET_URL,
      filename: 'a/b\\c".mp4',
    })
    await GET(req)

    expect(createPresignedR2GetUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        contentDisposition: 'attachment; filename="a-b-c.mp4"',
      }),
    )
  })

  it('returns 500 when signing the storage download fails', async () => {
    createPresignedR2GetUrl.mockRejectedValue(new Error('no credentials'))

    const req = createGET('/api/download', {
      url: ASSET_URL,
      filename: 'video.mp4',
    })
    const res = await GET(req)
    const body = await parseJSON<ApiEnvelope>(res)

    expect(res.status).toBe(500)
    expect(body.success).toBe(false)
  })

  it('proxies a trusted fal.ai temporary asset as an attachment', async () => {
    const req = createGET('/api/download', {
      url: FAL_ASSET_URL,
      filename: 'pixelvault-edit-upscale.png',
    })
    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Disposition')).toBe(
      'attachment; filename="pixelvault-edit-upscale.png"',
    )
    expect(await res.text()).toBe('asset-body')
    expect(fetchMock).toHaveBeenCalledWith(
      FAL_ASSET_URL,
      expect.objectContaining({ redirect: 'manual' }),
    )
  })

  it('returns 502 when the upstream asset request fails', async () => {
    fetchMock.mockResolvedValue(
      new Response('not found', {
        status: 404,
        headers: { 'Content-Type': 'text/plain' },
      }),
    )

    const req = createGET('/api/download', {
      url: FAL_ASSET_URL,
      filename: 'missing.png',
    })
    const res = await GET(req)
    const body = await parseJSON<ApiEnvelope>(res)

    expect(res.status).toBe(502)
    expect(body.success).toBe(false)
    expect(logger.error).toHaveBeenCalledWith(
      'Download proxy upstream failed',
      { url: FAL_ASSET_URL, status: 404 },
    )
  })
})
