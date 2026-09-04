import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createPOST,
  mockAuthenticated,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('server-only', () => ({}))

vi.mock('@/services/lora-training.service', () => ({
  completeTrainingImageDirectUpload: vi.fn(),
}))

import { completeTrainingImageDirectUpload } from '@/services/lora-training.service'

import { POST } from './route'

const mockComplete = vi.mocked(completeTrainingImageDirectUpload)

const STORAGE_KEY = 'lora-training/db_user_123/1-abc.png'

interface Envelope {
  success: boolean
  data?: { url?: string; storageKey?: string }
}

describe('POST /api/lora-training/uploads/complete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockComplete.mockResolvedValue({
      url: `https://cdn.example.com/${STORAGE_KEY}`,
      storageKey: STORAGE_KEY,
      mimeType: 'image/png',
      width: 512,
      height: 768,
      sizeBytes: 2048,
    })
  })

  it('rejects unauthenticated requests', async () => {
    mockUnauthenticated()

    const response = await POST(
      createPOST('/api/lora-training/uploads/complete', {
        storageKey: STORAGE_KEY,
        sizeBytes: 2048,
      }),
    )

    expect(response.status).toBe(401)
    expect(mockComplete).not.toHaveBeenCalled()
  })

  it('rejects a request without a storage key', async () => {
    const response = await POST(
      createPOST('/api/lora-training/uploads/complete', { sizeBytes: 2048 }),
    )

    expect(response.status).toBe(400)
    expect(mockComplete).not.toHaveBeenCalled()
  })

  it('returns the verified training image entry', async () => {
    const response = await POST(
      createPOST('/api/lora-training/uploads/complete', {
        storageKey: STORAGE_KEY,
        sizeBytes: 2048,
      }),
    )
    const body = await parseJSON<Envelope>(response)

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data?.storageKey).toBe(STORAGE_KEY)
    expect(mockComplete).toHaveBeenCalledWith('clerk_test_user', {
      storageKey: STORAGE_KEY,
      sizeBytes: 2048,
    })
  })

  it('answers with a failure envelope when verification throws', async () => {
    mockComplete.mockRejectedValue(
      new Error('Unsupported or corrupted image file'),
    )

    const response = await POST(
      createPOST('/api/lora-training/uploads/complete', {
        storageKey: STORAGE_KEY,
        sizeBytes: 2048,
      }),
    )

    expect(response.status).toBe(500)
    expect((await parseJSON<Envelope>(response)).success).toBe(false)
  })
})
