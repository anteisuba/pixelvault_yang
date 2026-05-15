import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  mockAuthenticated,
  mockUnauthenticated,
  mockRateLimitAllowed,
  mockRateLimitExceeded,
  createPOST,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('@/services/multiview-generate.service', () => ({
  generateMultiView: vi.fn(),
}))

import { POST } from '@/app/api/generate-multiview/route'
import { generateMultiView } from '@/services/multiview-generate.service'

const mockGenerate = vi.mocked(generateMultiView)

const VALID_BODY = {
  imageUrl: 'https://cdn.test/front.png',
  sourceGenerationId: 'gen_1',
}

const FAKE_SIDE_VIEW = {
  id: 'tmp-back',
  view: 'back',
  url: 'https://provider.test/back.png',
  width: 1024,
  height: 1024,
  prompt: 'back view',
  model: 'flux-kontext-pro',
  provider: 'fal.ai',
}

describe('POST /api/generate-multiview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockRateLimitAllowed()
    mockGenerate.mockResolvedValue({
      views: [
        FAKE_SIDE_VIEW,
        { ...FAKE_SIDE_VIEW, id: 'tmp-left', view: 'left' },
        { ...FAKE_SIDE_VIEW, id: 'tmp-right', view: 'right' },
      ],
    } as never)
  })

  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()
    const res = await POST(createPOST('/api/generate-multiview', VALID_BODY))
    expect(res.status).toBe(401)
  })

  it('returns 429 when rate limited', async () => {
    mockRateLimitExceeded()
    const res = await POST(createPOST('/api/generate-multiview', VALID_BODY))
    expect(res.status).toBe(429)
  })

  it('returns 400 when imageUrl is missing', async () => {
    const res = await POST(createPOST('/api/generate-multiview', {}))
    expect(res.status).toBe(400)
  })

  it('returns 400 when imageUrl is not a URL', async () => {
    const res = await POST(
      createPOST('/api/generate-multiview', { imageUrl: 'not a url' }),
    )
    expect(res.status).toBe(400)
  })

  it('returns the 3 views on success', async () => {
    const res = await POST(createPOST('/api/generate-multiview', VALID_BODY))
    const json = await parseJSON<{
      success: boolean
      data: { views: unknown[] }
    }>(res)

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data.views).toHaveLength(3)
    expect(mockGenerate).toHaveBeenCalledWith(
      'clerk_test_user',
      expect.objectContaining({ imageUrl: VALID_BODY.imageUrl }),
    )
  })
})
