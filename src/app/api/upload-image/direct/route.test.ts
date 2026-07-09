import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  mockAuthenticated,
  mockUnauthenticated,
  createPOST,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('server-only', () => ({}))

vi.mock('@/services/upload-image.service', () => ({
  createUserImageDirectUpload: vi.fn(),
}))

import { createUserImageDirectUpload } from '@/services/upload-image.service'

import { POST } from './route'

const mockCreateDirectUpload = vi.mocked(createUserImageDirectUpload)

describe('POST /api/upload-image/direct', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockCreateDirectUpload.mockResolvedValue({
      uploadUrl: 'https://r2.example.com/upload?signature=ok',
      storageKey: 'generations/db_user_123/image/2026-07-07_abc.png',
      publicUrl:
        'https://cdn.example.com/generations/db_user_123/image/2026-07-07_abc.png',
      headers: { 'Content-Type': 'image/png', 'If-None-Match': '*' },
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
      maxBytes: 15 * 1024 * 1024,
    })
  })

  it('rejects unauthenticated requests', async () => {
    mockUnauthenticated()

    const response = await POST(
      createPOST('/api/upload-image/direct', {
        mimeType: 'image/png',
        sizeBytes: 1024,
      }),
    )

    expect(response.status).toBe(401)
    expect(mockCreateDirectUpload).not.toHaveBeenCalled()
  })

  it('validates accepted image MIME types before preparing an upload', async () => {
    const response = await POST(
      createPOST('/api/upload-image/direct', {
        mimeType: 'image/svg+xml',
        sizeBytes: 1024,
      }),
    )

    expect(response.status).toBe(400)
    expect(mockCreateDirectUpload).not.toHaveBeenCalled()
  })

  it('returns a presigned upload package on the happy path', async () => {
    const response = await POST(
      createPOST('/api/upload-image/direct', {
        fileName: 'photo.png',
        mimeType: 'image/png',
        sizeBytes: 1024,
      }),
    )

    expect(response.status).toBe(200)
    const body = await parseJSON<{
      success: true
      data: { uploadUrl: string; storageKey: string }
    }>(response)
    expect(body.data.uploadUrl).toContain('https://r2.example.com/upload')
    expect(body.data.storageKey).toBe(
      'generations/db_user_123/image/2026-07-07_abc.png',
    )
    expect(mockCreateDirectUpload).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        fileName: 'photo.png',
        mimeType: 'image/png',
        sizeBytes: 1024,
      }),
    )
  })
})
