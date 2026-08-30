import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createPOST,
  mockAuthenticated,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('server-only', () => ({}))
vi.mock('@/services/upload-video.service', () => ({
  createUserVideoDirectUpload: vi.fn(),
}))

import { createUserVideoDirectUpload } from '@/services/upload-video.service'

import { POST } from './route'

const mockCreateUpload = vi.mocked(createUserVideoDirectUpload)

describe('POST /api/upload-video/direct', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockCreateUpload.mockResolvedValue({
      uploadUrl: 'https://r2.example.com/video?signature=ok',
      storageKey: 'generations/db_user_123/video/2026-08-29_abc.mp4',
      publicUrl:
        'https://cdn.example.com/generations/db_user_123/video/2026-08-29_abc.mp4',
      headers: { 'Content-Type': 'video/mp4', 'If-None-Match': '*' },
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
      maxBytes: 50 * 1024 * 1024,
    })
  })

  it('rejects unauthenticated requests', async () => {
    mockUnauthenticated()
    const response = await POST(
      createPOST('/api/upload-video/direct', {
        mimeType: 'video/mp4',
        sizeBytes: 1024,
      }),
    )
    expect(response.status).toBe(401)
    expect(mockCreateUpload).not.toHaveBeenCalled()
  })

  it('rejects unsupported video MIME types', async () => {
    const response = await POST(
      createPOST('/api/upload-video/direct', {
        mimeType: 'video/x-msvideo',
        sizeBytes: 1024,
      }),
    )
    expect(response.status).toBe(400)
    expect(mockCreateUpload).not.toHaveBeenCalled()
  })

  it('returns a presigned upload package', async () => {
    const response = await POST(
      createPOST('/api/upload-video/direct', {
        fileName: 'clip.mp4',
        mimeType: 'video/mp4',
        sizeBytes: 1024,
      }),
    )
    expect(response.status).toBe(200)
    const body = await parseJSON<{
      success: true
      data: { storageKey: string }
    }>(response)
    expect(body.data.storageKey).toContain('/video/')
    expect(mockCreateUpload).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ mimeType: 'video/mp4', sizeBytes: 1024 }),
    )
  })
})
