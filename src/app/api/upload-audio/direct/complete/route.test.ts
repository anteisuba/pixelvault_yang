import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createPOST,
  FAKE_GENERATION,
  mockAuthenticated,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('server-only', () => ({}))
vi.mock('@/services/upload-audio.service', () => ({
  completeUserAudioDirectUpload: vi.fn(),
}))

import { completeUserAudioDirectUpload } from '@/services/upload-audio.service'

import { POST } from './route'

const mockCompleteUpload = vi.mocked(completeUserAudioDirectUpload)
const validBody = {
  storageKey: 'generations/db_user_123/audio/2026-08-30_abc.mp3',
  mimeType: 'audio/mpeg',
  sizeBytes: 1024,
  duration: 120.5,
}

describe('POST /api/upload-audio/direct/complete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockCompleteUpload.mockResolvedValue({
      ...FAKE_GENERATION,
      outputType: 'AUDIO',
      url: 'https://cdn.example.com/r2/track.mp3',
    })
  })

  it('rejects unauthenticated requests', async () => {
    mockUnauthenticated()
    const response = await POST(
      createPOST('/api/upload-audio/direct/complete', validBody),
    )
    expect(response.status).toBe(401)
    expect(mockCompleteUpload).not.toHaveBeenCalled()
  })

  it('validates required audio metadata before calling the service', async () => {
    const response = await POST(
      createPOST('/api/upload-audio/direct/complete', {
        ...validBody,
        storageKey: '',
      }),
    )
    expect(response.status).toBe(400)
    expect(mockCompleteUpload).not.toHaveBeenCalled()
  })

  it('creates an AUDIO generation after R2 upload completes', async () => {
    const response = await POST(
      createPOST('/api/upload-audio/direct/complete', validBody),
    )
    expect(response.status).toBe(200)
    const body = await parseJSON<{
      success: true
      data: { generation: { outputType: string } }
    }>(response)
    expect(body.data.generation.outputType).toBe('AUDIO')
    expect(mockCompleteUpload).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining(validBody),
    )
  })
})
