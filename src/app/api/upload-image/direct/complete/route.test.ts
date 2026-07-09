import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  FAKE_GENERATION,
  mockAuthenticated,
  mockUnauthenticated,
  createPOST,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('server-only', () => ({}))

vi.mock('@/services/upload-image.service', () => ({
  completeUserImageDirectUpload: vi.fn(),
}))

import { completeUserImageDirectUpload } from '@/services/upload-image.service'

import { POST } from './route'

const mockCompleteDirectUpload = vi.mocked(completeUserImageDirectUpload)

describe('POST /api/upload-image/direct/complete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockCompleteDirectUpload.mockResolvedValue({
      ...FAKE_GENERATION,
      url: 'https://cdn.example.com/r2/photo.png',
    })
  })

  it('rejects unauthenticated requests', async () => {
    mockUnauthenticated()

    const response = await POST(
      createPOST('/api/upload-image/direct/complete', {
        storageKey: 'generations/db_user_123/image/2026-07-07_abc.png',
        mimeType: 'image/png',
        sizeBytes: 1024,
      }),
    )

    expect(response.status).toBe(401)
    expect(mockCompleteDirectUpload).not.toHaveBeenCalled()
  })

  it('validates required completion metadata before calling the service', async () => {
    const response = await POST(
      createPOST('/api/upload-image/direct/complete', {
        storageKey: '',
        mimeType: 'image/png',
        sizeBytes: 1024,
      }),
    )

    expect(response.status).toBe(400)
    expect(mockCompleteDirectUpload).not.toHaveBeenCalled()
  })

  it('creates a generation after the direct R2 upload completes', async () => {
    const response = await POST(
      createPOST('/api/upload-image/direct/complete', {
        storageKey: 'generations/db_user_123/image/2026-07-07_abc.png',
        mimeType: 'image/png',
        sizeBytes: 1024,
        note: 'holiday',
        projectId: 'proj-9',
      }),
    )

    expect(response.status).toBe(200)
    const body = await parseJSON<{
      success: true
      data: { generation: { url: string } }
    }>(response)
    expect(body.data.generation.url).toBe(
      'https://cdn.example.com/r2/photo.png',
    )
    expect(mockCompleteDirectUpload).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        storageKey: 'generations/db_user_123/image/2026-07-07_abc.png',
        mimeType: 'image/png',
        sizeBytes: 1024,
        note: 'holiday',
        projectId: 'proj-9',
      }),
    )
  })
})
