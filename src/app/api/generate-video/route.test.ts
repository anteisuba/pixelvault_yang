import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  mockAuthenticated,
  mockUnauthenticated,
  mockRateLimitAllowed,
  mockRateLimitExceeded,
  createPOST,
  parseJSON,
} from '@/test/api-helpers'

// ─── Mocks ────────────────────────────────────────────────────────

vi.mock('@/services/generate-video.service', () => ({
  submitVideoGeneration: vi.fn(),
}))

vi.mock('@/services/generate-image.service', () => ({
  isGenerateImageServiceError: vi.fn(),
}))

import { POST } from '@/app/api/generate-video/route'
import { submitVideoGeneration } from '@/services/generate-video.service'
import { isGenerateImageServiceError } from '@/services/generate-image.service'

const mockSubmit = vi.mocked(submitVideoGeneration)
const mockIsServiceError = vi.mocked(isGenerateImageServiceError)

// ─── Tests ────────────────────────────────────────────────────────

const VALID_BODY = {
  prompt: 'a cat walking on the beach',
  modelId: 'wan-ai/Wan2.1-T2V-14B',
}

const FAKE_SUBMIT_DATA = {
  jobId: 'job_123',
  requestId: 'req_123',
}

describe('POST /api/generate-video', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockRateLimitAllowed()
    mockSubmit.mockResolvedValue(FAKE_SUBMIT_DATA as never)
    mockIsServiceError.mockReturnValue(false)
  })

  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()
    const req = createPOST('/api/generate-video', VALID_BODY)
    const res = await POST(req)
    const json = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(401)
    expect(json.success).toBe(false)
    expect(json.error).toBe('Unauthorized')
  })

  it('returns 429 when rate limited', async () => {
    mockRateLimitExceeded()
    const req = createPOST('/api/generate-video', VALID_BODY)
    const res = await POST(req)
    const json = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(429)
    expect(json.success).toBe(false)
    expect(json.error).toContain('Too many requests')
  })

  it('returns 400 for missing prompt', async () => {
    const req = createPOST('/api/generate-video', { modelId: 'some-model' })
    const res = await POST(req)
    const json = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(400)
    expect(json.success).toBe(false)
  })

  it('returns 400 for missing modelId', async () => {
    const req = createPOST('/api/generate-video', { prompt: 'a video' })
    const res = await POST(req)
    const json = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(400)
    expect(json.success).toBe(false)
  })

  it('returns 400 for invalid JSON body', async () => {
    const req = createPOST('/api/generate-video', undefined)
    const res = await POST(req)
    const json = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(400)
    expect(json.success).toBe(false)
  })

  it('returns submit data on success', async () => {
    const req = createPOST('/api/generate-video', VALID_BODY)
    const res = await POST(req)
    const json = await parseJSON<{
      success: boolean
      data: { jobId: string; requestId: string }
    }>(res)

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data.jobId).toBe('job_123')
    expect(mockSubmit).toHaveBeenCalledWith(
      'clerk_test_user',
      expect.objectContaining({ prompt: VALID_BODY.prompt }),
    )
  })

  it('returns service error with correct status', async () => {
    const serviceError = Object.assign(new Error('Model unavailable'), {
      status: 503,
    })
    mockSubmit.mockRejectedValue(serviceError)
    mockIsServiceError.mockReturnValue(true)

    const req = createPOST('/api/generate-video', VALID_BODY)
    const res = await POST(req)
    const json = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(503)
    expect(json.success).toBe(false)
    expect(json.error).toBe('Model unavailable')
  })

  it('returns 500 on unexpected error', async () => {
    mockSubmit.mockRejectedValue(new Error('unexpected'))
    mockIsServiceError.mockReturnValue(false)

    const req = createPOST('/api/generate-video', VALID_BODY)
    const res = await POST(req)
    const json = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(500)
    expect(json.success).toBe(false)
    expect(json.error).toBe('Video generation failed. Please try again.')
  })
})
