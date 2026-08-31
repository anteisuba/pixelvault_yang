import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createPOST,
  mockAuthenticated,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('server-only', () => ({}))
vi.mock('@/services/upload-audio.service', () => ({
  createUserAudioDirectUpload: vi.fn(),
}))

import { createUserAudioDirectUpload } from '@/services/upload-audio.service'

import { POST } from './route'

const mockCreateUpload = vi.mocked(createUserAudioDirectUpload)

describe('POST /api/upload-audio/direct', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockCreateUpload.mockResolvedValue({
      uploadUrl: 'https://r2.example.com/audio?signature=ok',
      storageKey: 'generations/db_user_123/audio/2026-08-30_abc.mp3',
      publicUrl:
        'https://cdn.example.com/generations/db_user_123/audio/2026-08-30_abc.mp3',
      headers: { 'Content-Type': 'audio/mpeg', 'If-None-Match': '*' },
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      maxBytes: 5 * 1024 * 1024 * 1024,
    })
  })

  it('rejects unauthenticated requests', async () => {
    mockUnauthenticated()
    const response = await POST(
      createPOST('/api/upload-audio/direct', {
        mimeType: 'audio/mpeg',
        sizeBytes: 1024,
      }),
    )
    expect(response.status).toBe(401)
    expect(mockCreateUpload).not.toHaveBeenCalled()
  })

  it('rejects unsupported audio MIME types', async () => {
    const response = await POST(
      createPOST('/api/upload-audio/direct', {
        mimeType: 'application/octet-stream',
        sizeBytes: 1024,
      }),
    )
    expect(response.status).toBe(400)
    expect(mockCreateUpload).not.toHaveBeenCalled()
  })

  it('returns a presigned upload package', async () => {
    const response = await POST(
      createPOST('/api/upload-audio/direct', {
        fileName: 'track.mp3',
        mimeType: 'audio/mpeg',
        sizeBytes: 1024,
      }),
    )
    expect(response.status).toBe(200)
    const body = await parseJSON<{
      success: true
      data: { storageKey: string }
    }>(response)
    expect(body.data.storageKey).toContain('/audio/')
    expect(mockCreateUpload).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ mimeType: 'audio/mpeg', sizeBytes: 1024 }),
    )
  })
})
