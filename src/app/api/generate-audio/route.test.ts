import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createPOST,
  mockAuthenticated,
  mockRateLimitAllowed,
  mockRateLimitExceeded,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('@/services/generate-audio.service', () => ({
  submitAudioGeneration: vi.fn(),
}))

vi.mock('@/services/image/generate-image.service', () => ({
  isGenerateImageServiceError: vi.fn(),
}))

import { POST } from '@/app/api/generate-audio/route'
import { submitAudioGeneration } from '@/services/generate-audio.service'
import { isGenerateImageServiceError } from '@/services/image/generate-image.service'

const mockSubmitAudioGeneration = vi.mocked(submitAudioGeneration)
const mockIsServiceError = vi.mocked(isGenerateImageServiceError)

const VALID_SYNC_BODY = {
  prompt: 'Hello world',
  modelId: 'fish-audio-s2-pro',
}

const VALID_ASYNC_BODY = {
  prompt: 'Hello world',
  modelId: 'legacy-audio-queue',
}

describe('POST /api/generate-audio', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockRateLimitAllowed()
    mockIsServiceError.mockReturnValue(false)
    mockSubmitAudioGeneration.mockResolvedValue({
      jobId: 'job-audio-1',
    } as never)
  })

  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()
    const req = createPOST('/api/generate-audio', VALID_SYNC_BODY)
    const res = await POST(req)

    expect(res.status).toBe(401)
    const body = await parseJSON<{ success: boolean }>(res)
    expect(body.success).toBe(false)
  })

  it('returns 429 when rate limited', async () => {
    mockRateLimitExceeded()
    const req = createPOST('/api/generate-audio', VALID_SYNC_BODY)
    const res = await POST(req)

    expect(res.status).toBe(429)
    const body = await parseJSON<{ success: boolean; error: string }>(res)
    expect(body.success).toBe(false)
    expect(body.error).toContain('Too many requests')
  })

  it('returns 400 for missing prompt', async () => {
    const req = createPOST('/api/generate-audio', {
      modelId: 'fish-audio-s2-pro',
    })
    const res = await POST(req)

    expect(res.status).toBe(400)
    const body = await parseJSON<{ success: boolean }>(res)
    expect(body.success).toBe(false)
  })

  it('delegates Fish Audio models to async submit service', async () => {
    const req = createPOST('/api/generate-audio', VALID_SYNC_BODY)
    const res = await POST(req)

    expect(res.status).toBe(200)
    const body = await parseJSON<{
      success: boolean
      data: { jobId: string }
    }>(res)
    expect(body.success).toBe(true)
    expect(body.data.jobId).toBe('job-audio-1')
    expect(mockSubmitAudioGeneration).toHaveBeenCalledWith(
      'clerk_test_user',
      expect.objectContaining({ prompt: VALID_SYNC_BODY.prompt }),
    )
  })

  it('delegates queued models to async submit service', async () => {
    const req = createPOST('/api/generate-audio', VALID_ASYNC_BODY)
    const res = await POST(req)

    expect(res.status).toBe(200)
    const body = await parseJSON<{
      success: boolean
      data: { jobId: string }
    }>(res)
    expect(body.success).toBe(true)
    expect(body.data.jobId).toBe('job-audio-1')
    expect(mockSubmitAudioGeneration).toHaveBeenCalledWith(
      'clerk_test_user',
      expect.objectContaining({ prompt: VALID_ASYNC_BODY.prompt }),
    )
  })

  it('returns service error status when async submit fails', async () => {
    mockSubmitAudioGeneration.mockRejectedValue(
      Object.assign(new Error('Audio provider unavailable'), {
        code: 'PROVIDER_ERROR',
        status: 503,
      }),
    )
    mockIsServiceError.mockReturnValue(true)

    const req = createPOST('/api/generate-audio', VALID_SYNC_BODY)
    const res = await POST(req)

    expect(res.status).toBe(503)
    const body = await parseJSON<{ success: boolean; error: string }>(res)
    expect(body.success).toBe(false)
    expect(body.error).toBe('Audio provider unavailable')
  })

  it('returns 500 on unexpected async submit error', async () => {
    mockSubmitAudioGeneration.mockRejectedValue(new Error('unexpected'))

    const req = createPOST('/api/generate-audio', VALID_ASYNC_BODY)
    const res = await POST(req)

    expect(res.status).toBe(500)
    const body = await parseJSON<{ success: boolean; error: string }>(res)
    expect(body.success).toBe(false)
  })
})
