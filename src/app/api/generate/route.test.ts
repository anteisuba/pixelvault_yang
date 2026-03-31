import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  mockAuthenticated,
  mockUnauthenticated,
  mockRateLimitAllowed,
  mockRateLimitExceeded,
  createPOST,
  parseJSON,
  FAKE_GENERATION,
} from '@/test/api-helpers'

// ─── Mocks ────────────────────────────────────────────────────────

vi.mock('@/services/generate-image.service', () => ({
  generateImageForUser: vi.fn(),
  isGenerateImageServiceError: vi.fn(),
}))

import { POST } from '@/app/api/generate/route'
import {
  generateImageForUser,
  isGenerateImageServiceError,
} from '@/services/generate-image.service'

const mockGenerate = vi.mocked(generateImageForUser)
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
    mockGenerate.mockResolvedValue(FAKE_GENERATION as never)
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

  it('returns generation on success', async () => {
    const req = createPOST('/api/generate', VALID_BODY)
    const res = await POST(req)
    const json = await parseJSON<{
      success: boolean
      data: { generation: typeof FAKE_GENERATION }
    }>(res)

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data.generation).toEqual(
      expect.objectContaining({ id: FAKE_GENERATION.id }),
    )
    expect(mockGenerate).toHaveBeenCalledWith(
      'clerk_test_user',
      expect.objectContaining({ prompt: VALID_BODY.prompt }),
    )
  })

  it('returns sanitized error on service failure', async () => {
    const serviceError = Object.assign(new Error('Insufficient credits'), {
      status: 402,
    })
    mockGenerate.mockRejectedValue(serviceError)
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
    expect(mockGenerate).toHaveBeenCalledWith(
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
    expect(mockGenerate).toHaveBeenCalledWith(
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
    mockGenerate.mockRejectedValue(new Error('unexpected'))
    mockIsServiceError.mockReturnValue(false)

    const req = createPOST('/api/generate', VALID_BODY)
    const res = await POST(req)
    const json = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(500)
    expect(json.success).toBe(false)
    expect(json.error).toBe('An unexpected error occurred. Please try again.')
  })
})
