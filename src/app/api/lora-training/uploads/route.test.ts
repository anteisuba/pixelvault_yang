import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createPOST,
  mockAuthenticated,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'
import { LORA_TRAINING_IMAGE_MAX_BYTES } from '@/constants/uploads'

vi.mock('server-only', () => ({}))

vi.mock('@/services/lora-training.service', () => ({
  createTrainingImageDirectUpload: vi.fn(),
}))

import { createTrainingImageDirectUpload } from '@/services/lora-training.service'

import { POST } from './route'

const mockPrepare = vi.mocked(createTrainingImageDirectUpload)

interface Envelope {
  success: boolean
  data?: { uploadUrl?: string; storageKey?: string }
}

describe('POST /api/lora-training/uploads', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockPrepare.mockResolvedValue({
      uploadUrl: 'https://r2.example.com/upload?signature=ok',
      storageKey: 'lora-training/db_user_123/1-abc.png',
      headers: { 'Content-Type': 'image/png', 'If-None-Match': '*' },
      maxBytes: LORA_TRAINING_IMAGE_MAX_BYTES,
    })
  })

  it('rejects unauthenticated requests', async () => {
    mockUnauthenticated()

    const response = await POST(
      createPOST('/api/lora-training/uploads', {
        mimeType: 'image/png',
        sizeBytes: 1024,
      }),
    )

    expect(response.status).toBe(401)
    expect(mockPrepare).not.toHaveBeenCalled()
  })

  it('rejects a MIME type outside the accepted image set', async () => {
    const response = await POST(
      createPOST('/api/lora-training/uploads', {
        mimeType: 'image/svg+xml',
        sizeBytes: 1024,
      }),
    )

    expect(response.status).toBe(400)
    expect(mockPrepare).not.toHaveBeenCalled()
  })

  it('rejects a non-positive declared size', async () => {
    const response = await POST(
      createPOST('/api/lora-training/uploads', {
        mimeType: 'image/png',
        sizeBytes: 0,
      }),
    )

    expect(response.status).toBe(400)
    expect(mockPrepare).not.toHaveBeenCalled()
  })

  it('returns the presigned PUT for a valid request', async () => {
    const response = await POST(
      createPOST('/api/lora-training/uploads', {
        mimeType: 'image/png',
        sizeBytes: 1024,
      }),
    )
    const body = await parseJSON<Envelope>(response)

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data?.uploadUrl).toBe(
      'https://r2.example.com/upload?signature=ok',
    )
    expect(mockPrepare).toHaveBeenCalledWith('clerk_test_user', {
      mimeType: 'image/png',
      sizeBytes: 1024,
    })
  })
})
