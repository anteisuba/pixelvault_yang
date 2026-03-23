import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  mockAuthenticated,
  mockUnauthenticated,
  mockRateLimitAllowed,
  createPOST,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('@/services/prompt-enhance.service', () => ({
  enhancePrompt: vi.fn(),
}))

import { enhancePrompt } from '@/services/prompt-enhance.service'
import { POST } from './route'

beforeEach(() => {
  vi.clearAllMocks()
  mockRateLimitAllowed()
})

describe('POST /api/prompt/enhance', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()
    const req = createPOST('/api/prompt/enhance', {
      prompt: 'a cat',
      style: 'detailed',
    })
    const res = await POST(req)

    expect(res.status).toBe(401)
    const body = await parseJSON(res)
    expect(body).toEqual({ success: false, error: 'Unauthorized' })
  })

  it('returns 400 for invalid body (missing prompt)', async () => {
    mockAuthenticated()
    const req = createPOST('/api/prompt/enhance', { style: 'detailed' })
    const res = await POST(req)

    expect(res.status).toBe(400)
    const body = await parseJSON(res)
    expect(body).toMatchObject({ success: false })
    expect(body).toHaveProperty('error')
  })

  it('returns 400 for invalid body (missing style)', async () => {
    mockAuthenticated()
    const req = createPOST('/api/prompt/enhance', { prompt: 'a cat' })
    const res = await POST(req)

    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid style value', async () => {
    mockAuthenticated()
    const req = createPOST('/api/prompt/enhance', {
      prompt: 'a cat',
      style: 'invalid_style',
    })
    const res = await POST(req)

    expect(res.status).toBe(400)
  })

  it('returns enhanced prompt on success', async () => {
    mockAuthenticated()
    const enhanceResult = {
      original: 'a cat',
      enhanced:
        'A majestic domestic cat with piercing green eyes, soft lighting, detailed fur texture',
      style: 'detailed',
    }
    vi.mocked(enhancePrompt).mockResolvedValue(enhanceResult)

    const req = createPOST('/api/prompt/enhance', {
      prompt: 'a cat',
      style: 'detailed',
    })
    const res = await POST(req)

    expect(res.status).toBe(200)
    const body = await parseJSON(res)
    expect(body).toEqual({ success: true, data: enhanceResult })
    expect(enhancePrompt).toHaveBeenCalledWith(
      'clerk_test_user',
      'a cat',
      'detailed',
    )
  })

  it('returns 500 when service throws', async () => {
    mockAuthenticated()
    vi.mocked(enhancePrompt).mockRejectedValue(new Error('AI error'))

    const req = createPOST('/api/prompt/enhance', {
      prompt: 'a cat',
      style: 'artistic',
    })
    const res = await POST(req)

    expect(res.status).toBe(500)
    const body = await parseJSON(res)
    expect(body).toEqual({
      success: false,
      error: 'Prompt enhancement failed. Please try again.',
    })
  })
})
