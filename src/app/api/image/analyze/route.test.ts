import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  mockAuthenticated,
  mockUnauthenticated,
  mockRateLimitAllowed,
  mockRateLimitExceeded,
  createPOST,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('@/services/image-analysis.service', () => ({
  analyzeImage: vi.fn(),
}))

import { analyzeImage } from '@/services/image-analysis.service'
import { POST } from './route'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/image/analyze', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()
    const req = createPOST('/api/image/analyze', {
      imageData: 'data:image/png;base64,abc',
    })
    const res = await POST(req)

    expect(res.status).toBe(401)
    const body = await parseJSON(res)
    expect(body).toMatchObject({
      success: false,
      error: 'Unauthorized',
      errorCode: 'UNAUTHORIZED',
      i18nKey: 'errors.auth.unauthorized',
    })
  })

  it('returns 429 when rate limited', async () => {
    mockAuthenticated()
    mockRateLimitExceeded()

    const req = createPOST('/api/image/analyze', {
      imageData: 'data:image/png;base64,abc',
    })
    const res = await POST(req)

    expect(res.status).toBe(429)
    const body = await parseJSON(res)
    expect(body).toMatchObject({
      success: false,
      error: 'Too many requests. Please wait a moment.',
      errorCode: 'RATE_LIMIT_EXCEEDED',
      i18nKey: 'errors.rateLimit',
    })
  })

  it('returns 400 for missing imageData', async () => {
    mockAuthenticated()
    mockRateLimitAllowed()

    const req = createPOST('/api/image/analyze', {})
    const res = await POST(req)

    expect(res.status).toBe(400)
    const body = await parseJSON(res)
    expect(body).toMatchObject({ success: false })
    expect(body).toHaveProperty('error')
  })

  it('returns 400 when imageData exceeds 14MB', async () => {
    mockAuthenticated()
    mockRateLimitAllowed()

    const oversizedData =
      'data:image/png;base64,' + 'x'.repeat(14 * 1024 * 1024 + 1)
    const req = createPOST('/api/image/analyze', {
      imageData: oversizedData,
    })
    const res = await POST(req)

    expect(res.status).toBe(400)
    const body = await parseJSON(res)
    expect(body).toMatchObject({
      success: false,
      error: 'Image too large. Maximum size is 10MB.',
      errorCode: 'VALIDATION_ERROR',
      i18nKey: 'errors.validation.invalidInput',
    })
  })

  it('returns analysis result on success', async () => {
    mockAuthenticated()
    mockRateLimitAllowed()

    const analysisResult = {
      id: 'analysis_123',
      generatedPrompt: 'A scenic mountain landscape at sunset',
      sourceImageUrl: 'https://storage.example.com/uploaded.png',
    }
    vi.mocked(analyzeImage).mockResolvedValue(analysisResult)

    const req = createPOST('/api/image/analyze', {
      imageData: 'data:image/png;base64,validbase64data',
    })
    const res = await POST(req)

    expect(res.status).toBe(200)
    const body = await parseJSON(res)
    expect(body).toEqual({ success: true, data: analysisResult })
    expect(analyzeImage).toHaveBeenCalledWith(
      'clerk_test_user',
      'data:image/png;base64,validbase64data',
      undefined,
    )
  })

  it('returns 500 when service throws', async () => {
    mockAuthenticated()
    mockRateLimitAllowed()

    vi.mocked(analyzeImage).mockRejectedValue(new Error('AI provider down'))

    const req = createPOST('/api/image/analyze', {
      imageData: 'data:image/png;base64,abc',
    })
    const res = await POST(req)

    expect(res.status).toBe(500)
    const body = await parseJSON(res)
    expect(body).toMatchObject({
      success: false,
      error: 'An unexpected error occurred. Please try again.',
      errorCode: 'INTERNAL_ERROR',
      i18nKey: 'errors.common.unexpected',
    })
  })
})
