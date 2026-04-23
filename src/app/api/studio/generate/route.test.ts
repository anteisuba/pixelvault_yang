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

vi.mock('@/services/studio-generate.service', () => ({
  compileAndGenerate: vi.fn(),
}))

vi.mock('@/services/generate-image.service', () => ({
  isGenerateImageServiceError: vi.fn(),
}))

import { POST } from '@/app/api/studio/generate/route'
import { compileAndGenerate } from '@/services/studio-generate.service'
import { isGenerateImageServiceError } from '@/services/generate-image.service'

const mockCompileAndGenerate = vi.mocked(compileAndGenerate)
const mockIsServiceError = vi.mocked(isGenerateImageServiceError)

// ─── Fixtures ─────────────────────────────────────────────────────

const QUICK_MODE_BODY = {
  modelId: 'gemini-3.1-flash-image-preview',
  freePrompt: 'a beautiful sunset',
  aspectRatio: '1:1' as const,
}

const CARD_MODE_BODY = {
  styleCardId: 'style-1',
  characterCardId: 'char-1',
  freePrompt: 'add some sparkles',
  aspectRatio: '16:9' as const,
}

// ─── Tests ────────────────────────────────────────────────────────

describe('POST /api/studio/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockRateLimitAllowed()
    mockCompileAndGenerate.mockResolvedValue(FAKE_GENERATION as never)
    mockIsServiceError.mockReturnValue(false)
  })

  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()
    const req = createPOST('/api/studio/generate', QUICK_MODE_BODY)
    const res = await POST(req)
    const json = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(401)
    expect(json.success).toBe(false)
  })

  it('returns 429 when rate limited', async () => {
    mockRateLimitExceeded()
    const req = createPOST('/api/studio/generate', QUICK_MODE_BODY)
    const res = await POST(req)
    const json = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(429)
    expect(json.success).toBe(false)
  })

  it('returns 400 for invalid JSON body', async () => {
    const req = createPOST('/api/studio/generate', undefined)
    const res = await POST(req)
    const json = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(400)
    expect(json.success).toBe(false)
  })

  it('succeeds with quick mode input (modelId present)', async () => {
    const req = createPOST('/api/studio/generate', QUICK_MODE_BODY)
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
    expect(mockCompileAndGenerate).toHaveBeenCalledWith(
      'clerk_test_user',
      expect.objectContaining({
        modelId: QUICK_MODE_BODY.modelId,
        freePrompt: QUICK_MODE_BODY.freePrompt,
      }),
    )
  })

  it('succeeds with card mode input (styleCardId present)', async () => {
    const req = createPOST('/api/studio/generate', CARD_MODE_BODY)
    const res = await POST(req)
    const json = await parseJSON<{
      success: boolean
      data: { generation: typeof FAKE_GENERATION }
    }>(res)

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(mockCompileAndGenerate).toHaveBeenCalledWith(
      'clerk_test_user',
      expect.objectContaining({
        styleCardId: CARD_MODE_BODY.styleCardId,
        characterCardId: CARD_MODE_BODY.characterCardId,
      }),
    )
  })

  it('passes runGroup fields for batch generation', async () => {
    const batchBody = {
      ...QUICK_MODE_BODY,
      runGroupId: 'run-123',
      runGroupType: 'variant' as const,
      runGroupIndex: 2,
      seed: 42,
    }
    const req = createPOST('/api/studio/generate', batchBody)
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(mockCompileAndGenerate).toHaveBeenCalledWith(
      'clerk_test_user',
      expect.objectContaining({
        runGroupId: 'run-123',
        runGroupType: 'variant',
        runGroupIndex: 2,
        seed: 42,
      }),
    )
  })

  it('passes referenceImages when provided', async () => {
    const bodyWithRef = {
      ...QUICK_MODE_BODY,
      referenceImages: ['https://example.com/ref.png'],
    }
    const req = createPOST('/api/studio/generate', bodyWithRef)
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(mockCompileAndGenerate).toHaveBeenCalledWith(
      'clerk_test_user',
      expect.objectContaining({
        referenceImages: ['https://example.com/ref.png'],
      }),
    )
  })

  it('returns service error with correct status', async () => {
    const serviceError = Object.assign(new Error('Model unavailable'), {
      code: 'UNSUPPORTED_MODEL',
      status: 400,
    })
    mockCompileAndGenerate.mockRejectedValue(serviceError)
    mockIsServiceError.mockReturnValue(true)

    const req = createPOST('/api/studio/generate', QUICK_MODE_BODY)
    const res = await POST(req)
    const json = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(400)
    expect(json.success).toBe(false)
    expect(json.error).toBe('Model unavailable')
  })

  it('returns 500 on unexpected error', async () => {
    mockCompileAndGenerate.mockRejectedValue(new Error('DB connection lost'))
    mockIsServiceError.mockReturnValue(false)

    const req = createPOST('/api/studio/generate', QUICK_MODE_BODY)
    const res = await POST(req)
    const json = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(500)
    expect(json.success).toBe(false)
  })

  it('defaults aspectRatio to 1:1 when not provided', async () => {
    const bodyWithoutAspect = {
      modelId: QUICK_MODE_BODY.modelId,
      freePrompt: QUICK_MODE_BODY.freePrompt,
    }
    const req = createPOST('/api/studio/generate', bodyWithoutAspect)
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(mockCompileAndGenerate).toHaveBeenCalledWith(
      'clerk_test_user',
      expect.objectContaining({ aspectRatio: '1:1' }),
    )
  })
})
