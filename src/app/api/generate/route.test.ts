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

vi.mock('@/services/image/generate-image.service', () => ({
  isGenerateImageServiceError: vi.fn(),
}))
vi.mock('@/services/image/submit-image.service', () => ({
  submitImageGeneration: vi.fn(),
}))

import { POST } from '@/app/api/generate/route'
import { isGenerateImageServiceError } from '@/services/image/generate-image.service'
import { submitImageGeneration } from '@/services/image/submit-image.service'

const mockSubmitImageGeneration = vi.mocked(submitImageGeneration)
const mockIsServiceError = vi.mocked(isGenerateImageServiceError)

// ─── Tests ────────────────────────────────────────────────────────

const VALID_BODY = {
  prompt: 'a beautiful sunset over the ocean',
  modelId: 'sdxl',
  aspectRatio: '1:1',
}

describe('POST /api/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockRateLimitAllowed()
    mockSubmitImageGeneration.mockResolvedValue({
      jobId: 'job-image-1',
      requestId: 'wf-image-1',
    } as never)
    mockIsServiceError.mockReturnValue(false)
  })

  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()
    const req = createPOST('/api/generate', VALID_BODY)
    const res = await POST(req)
    const json = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(401)
    expect(json.success).toBe(false)
    expect(json.error).toBe('Unauthorized')
  })

  it('returns 429 when rate limited', async () => {
    mockRateLimitExceeded()
    const req = createPOST('/api/generate', VALID_BODY)
    const res = await POST(req)
    const json = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(429)
    expect(json.success).toBe(false)
    expect(json.error).toContain('Too many requests')
  })

  it('returns 400 for missing prompt', async () => {
    const req = createPOST('/api/generate', { modelId: 'sdxl' })
    const res = await POST(req)
    const json = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(400)
    expect(json.success).toBe(false)
  })

  it('returns 400 for missing modelId', async () => {
    const req = createPOST('/api/generate', { prompt: 'hello' })
    const res = await POST(req)
    const json = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(400)
    expect(json.success).toBe(false)
  })

  it('returns 400 for invalid JSON body', async () => {
    const req = createPOST('/api/generate', undefined)
    const res = await POST(req)
    const json = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(400)
    expect(json.success).toBe(false)
  })

  it('returns job references on success', async () => {
    const req = createPOST('/api/generate', VALID_BODY)
    const res = await POST(req)
    const json = await parseJSON<{
      success: boolean
      data: { jobId: string; requestId: string }
    }>(res)

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data).toEqual({
      jobId: 'job-image-1',
      requestId: 'wf-image-1',
    })
    expect(mockSubmitImageGeneration).toHaveBeenCalledWith(
      'clerk_test_user',
      expect.objectContaining({ prompt: VALID_BODY.prompt }),
    )
  })

  it('returns sanitized error on service failure', async () => {
    const serviceError = Object.assign(new Error('Insufficient credits'), {
      status: 402,
    })
    mockSubmitImageGeneration.mockRejectedValue(serviceError)
    mockIsServiceError.mockReturnValue(true)

    const req = createPOST('/api/generate', VALID_BODY)
    const res = await POST(req)
    const json = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(402)
    expect(json.success).toBe(false)
    expect(json.error).toBe('Insufficient credits')
  })

  it('passes advancedParams to service when provided', async () => {
    const bodyWithAdvanced = {
      ...VALID_BODY,
      advancedParams: {
        negativePrompt: 'blurry, low quality',
        guidanceScale: 7.5,
        steps: 30,
        seed: 42,
      },
    }
    const req = createPOST('/api/generate', bodyWithAdvanced)
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(mockSubmitImageGeneration).toHaveBeenCalledWith(
      'clerk_test_user',
      expect.objectContaining({
        prompt: VALID_BODY.prompt,
        advancedParams: expect.objectContaining({
          negativePrompt: 'blurry, low quality',
          guidanceScale: 7.5,
          steps: 30,
          seed: 42,
        }),
      }),
    )
  })

  it('succeeds without advancedParams (optional field)', async () => {
    const req = createPOST('/api/generate', VALID_BODY)
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(mockSubmitImageGeneration).toHaveBeenCalledWith(
      'clerk_test_user',
      expect.not.objectContaining({ advancedParams: expect.anything() }),
    )
  })

  it('returns 400 for invalid advancedParams values', async () => {
    const bodyWithBadAdvanced = {
      ...VALID_BODY,
      advancedParams: {
        guidanceScale: 999, // exceeds max of 30
      },
    }
    const req = createPOST('/api/generate', bodyWithBadAdvanced)
    const res = await POST(req)
    const json = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(400)
    expect(json.success).toBe(false)
  })

  it('returns 500 on unexpected error', async () => {
    mockSubmitImageGeneration.mockRejectedValue(new Error('unexpected'))
    mockIsServiceError.mockReturnValue(false)

    const req = createPOST('/api/generate', VALID_BODY)
    const res = await POST(req)
    const json = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(500)
    expect(json.success).toBe(false)
    expect(json.error).toBe('An unexpected error occurred. Please try again.')
  })
})
