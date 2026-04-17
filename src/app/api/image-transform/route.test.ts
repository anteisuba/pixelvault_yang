import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  mockAuthenticated,
  mockUnauthenticated,
  mockRateLimitAllowed,
  mockRateLimitExceeded,
  createPOST,
  parseJSON,
} from '@/test/api-helpers'

// ─── Mocks ──────────────────────────────────────────────────────

vi.mock('@/services/image-transform.service', () => ({
  transformImage: vi.fn(),
}))

import { POST } from '@/app/api/image-transform/route'
import { transformImage } from '@/services/image-transform.service'
import type { TransformOutput } from '@/types/transform'

const mockTransformImage = vi.mocked(transformImage)

// ─── Fixtures ───────────────────────────────────────────────────

const VALID_BODY = {
  input: { type: 'image', data: 'data:image/png;base64,abc123' },
  subject: { type: 'upload', imageData: 'data:image/png;base64,abc123' },
  style: { type: 'preset', presetId: 'preset-watercolor' },
  transformation: { type: 'style' },
  preservation: { structure: 0.7, text: 0.9, composition: 0.6, people: 0.7 },
  variants: 4,
}

const MOCK_OUTPUT: TransformOutput = {
  original: { url: 'data:image/png;base64,abc', width: 512, height: 512 },
  variants: [
    {
      status: 'success',
      result: {
        url: 'https://r2.example/1.png',
        width: 512,
        height: 512,
        cost: 1,
      },
    },
  ],
  totalCost: 1,
}

// ─── Tests ──────────────────────────────────────────────────────

describe('POST /api/image-transform', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockRateLimitAllowed()
    mockTransformImage.mockResolvedValue(MOCK_OUTPUT)
  })

  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()
    const req = createPOST('/api/image-transform', VALID_BODY)
    const res = await POST(req)
    const json = await parseJSON<{ success: boolean }>(res)

    expect(res.status).toBe(401)
    expect(json.success).toBe(false)
  })

  it('returns 429 when rate limited', async () => {
    mockRateLimitExceeded()
    const req = createPOST('/api/image-transform', VALID_BODY)
    const res = await POST(req)
    const json = await parseJSON<{ success: boolean }>(res)

    expect(res.status).toBe(429)
    expect(json.success).toBe(false)
  })

  it('returns 400 for invalid JSON body', async () => {
    const req = createPOST('/api/image-transform', undefined)
    const res = await POST(req)
    const json = await parseJSON<{ success: boolean }>(res)

    expect(res.status).toBe(400)
    expect(json.success).toBe(false)
  })

  it('returns 400 when transformation.type is not style (Phase 1 refinement)', async () => {
    const body = {
      ...VALID_BODY,
      transformation: { type: 'pose' },
    }
    const req = createPOST('/api/image-transform', body)
    const res = await POST(req)
    const json = await parseJSON<{ success: boolean }>(res)

    expect(res.status).toBe(400)
    expect(json.success).toBe(false)
  })

  it('returns 400 when subject.imageData is missing for upload type', async () => {
    const body = {
      ...VALID_BODY,
      subject: { type: 'upload' },
    }
    const req = createPOST('/api/image-transform', body)
    const res = await POST(req)
    const json = await parseJSON<{ success: boolean }>(res)

    expect(res.status).toBe(400)
    expect(json.success).toBe(false)
  })

  it('returns 200 with transform output on success', async () => {
    const req = createPOST('/api/image-transform', VALID_BODY)
    const res = await POST(req)
    const json = await parseJSON<{ success: boolean; data: TransformOutput }>(
      res,
    )

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data).toEqual(MOCK_OUTPUT)
    expect(mockTransformImage).toHaveBeenCalledOnce()
  })

  it('passes clerkId and validated data to service', async () => {
    const req = createPOST('/api/image-transform', VALID_BODY)
    await POST(req)

    expect(mockTransformImage).toHaveBeenCalledWith(
      'clerk_test_user',
      expect.objectContaining({
        transformation: { type: 'style' },
        variants: 4,
      }),
    )
  })

  it('returns 500 when service throws unexpected error', async () => {
    mockTransformImage.mockRejectedValue(new Error('Unexpected'))
    const req = createPOST('/api/image-transform', VALID_BODY)
    const res = await POST(req)
    const json = await parseJSON<{ success: boolean }>(res)

    expect(res.status).toBe(500)
    expect(json.success).toBe(false)
  })
})
