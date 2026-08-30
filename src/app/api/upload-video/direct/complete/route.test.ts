import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createPOST,
  FAKE_GENERATION,
  mockAuthenticated,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('server-only', () => ({}))
vi.mock('@/services/upload-video.service', () => ({
  completeUserVideoDirectUpload: vi.fn(),
}))

import { completeUserVideoDirectUpload } from '@/services/upload-video.service'

import { POST } from './route'

const mockCompleteUpload = vi.mocked(completeUserVideoDirectUpload)
const validBody = {
  storageKey: 'generations/db_user_123/video/2026-08-29_abc.mp4',
  mimeType: 'video/mp4',
  sizeBytes: 1024,
  width: 1920,
  height: 1080,
  duration: 8.5,
}

describe('POST /api/upload-video/direct/complete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockCompleteUpload.mockResolvedValue({
      ...FAKE_GENERATION,
      outputType: 'VIDEO',
      url: 'https://cdn.example.com/r2/clip.mp4',
    })
  })

  it('rejects unauthenticated requests', async () => {
    mockUnauthenticated()
    const response = await POST(
      createPOST('/api/upload-video/direct/complete', validBody),
    )
    expect(response.status).toBe(401)
    expect(mockCompleteUpload).not.toHaveBeenCalled()
  })

  it('validates required video metadata before calling the service', async () => {
    const response = await POST(
      createPOST('/api/upload-video/direct/complete', {
        ...validBody,
        storageKey: '',
      }),
    )
    expect(response.status).toBe(400)
    expect(mockCompleteUpload).not.toHaveBeenCalled()
  })

  it('creates a VIDEO generation after R2 upload completes', async () => {
    const response = await POST(
      createPOST('/api/upload-video/direct/complete', validBody),
    )
    expect(response.status).toBe(200)
    const body = await parseJSON<{
      success: true
      data: { generation: { outputType: string } }
    }>(response)
    expect(body.data.generation.outputType).toBe('VIDEO')
    expect(mockCompleteUpload).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining(validBody),
    )
  })
})
