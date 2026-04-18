import { describe, it, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'

import {
  mockAuthenticated,
  mockUnauthenticated,
  mockRateLimitAllowed,
  mockRateLimitExceeded,
  createPOST,
  parseJSON,
} from '@/test/api-helpers'

// ─── Mocks ───────────────────────────────────────────────────────

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('@/services/generate-image.service', () => ({
  isGenerateImageServiceError: vi.fn(),
}))

import { createApiRoute } from '@/lib/api-route-factory'
import {
  ProviderError,
  InsufficientCreditsError,
  GenerationValidationError,
} from '@/lib/errors'
import { isGenerateImageServiceError } from '@/services/generate-image.service'

const mockIsServiceError = vi.mocked(isGenerateImageServiceError)

// ─── Test Schema & Route ─────────────────────────────────────────

const testSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  count: z.number().int().min(1).max(100),
})

type TestResult = {
  id: string
  name: string
  seed?: bigint | number | string | null
}

const mockHandler =
  vi.fn<
    (clerkId: string, data: z.infer<typeof testSchema>) => Promise<TestResult>
  >()

const POST = createApiRoute<typeof testSchema, TestResult>({
  schema: testSchema,
  rateLimit: { limit: 10, windowSeconds: 60 },
  routeName: 'POST /api/test',
  handler: mockHandler,
})

// ─── Tests ───────────────────────────────────────────────────────

describe('createApiRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockRateLimitAllowed()
    mockIsServiceError.mockReturnValue(false)
    mockHandler.mockResolvedValue({ id: '1', name: 'test' })
  })

  // ── Success ──

  it('returns 200 with { success: true, data } on success', async () => {
    const req = createPOST('/api/test', { name: 'hello', count: 5 })
    const res = await POST(req)
    const json = await parseJSON<{ success: boolean; data: TestResult }>(res)

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data).toEqual({ id: '1', name: 'test' })
  })

  it('passes clerkId and validated data to handler', async () => {
    mockAuthenticated('user_abc')
    const req = createPOST('/api/test', { name: 'hello', count: 3 })
    await POST(req)

    expect(mockHandler).toHaveBeenCalledWith('user_abc', {
      name: 'hello',
      count: 3,
    })
  })

  it('includes rate limit headers on success', async () => {
    const req = createPOST('/api/test', { name: 'a', count: 1 })
    const res = await POST(req)

    expect(res.headers.get('X-RateLimit-Limit')).toBe('10')
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('9')
  })

  it('serializes bigint fields in successful responses', async () => {
    mockHandler.mockResolvedValue({
      id: '1',
      name: 'seeded',
      seed: BigInt(42),
    })

    const req = createPOST('/api/test', { name: 'hello', count: 5 })
    const res = await POST(req)
    const json = await parseJSON<{
      success: boolean
      data: { id: string; name: string; seed: number | string }
    }>(res)

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data.seed).toBe(42)
  })

  // ── Auth ──

  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()
    const req = createPOST('/api/test', { name: 'a', count: 1 })
    const res = await POST(req)
    const json = await parseJSON<{
      success: boolean
      error: string
      errorCode: string
    }>(res)

    expect(res.status).toBe(401)
    expect(json.success).toBe(false)
    expect(json.errorCode).toBe('UNAUTHORIZED')
  })

  // ── Rate Limit ──

  it('returns 429 when rate limited', async () => {
    mockRateLimitExceeded()
    const req = createPOST('/api/test', { name: 'a', count: 1 })
    const res = await POST(req)
    const json = await parseJSON<{
      success: boolean
      error: string
      errorCode: string
    }>(res)

    expect(res.status).toBe(429)
    expect(json.success).toBe(false)
    expect(json.errorCode).toBe('RATE_LIMIT_EXCEEDED')
    expect(res.headers.get('Retry-After')).toBe('60')
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('0')
  })

  // ── JSON Parse ──

  it('returns 400 for invalid JSON body', async () => {
    const req = createPOST('/api/test', undefined)
    const res = await POST(req)
    const json = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(400)
    expect(json.success).toBe(false)
    expect(json.error).toBe('Invalid JSON body')
  })

  // ── Zod Validation ──

  it('returns 400 with field errors on validation failure', async () => {
    const req = createPOST('/api/test', { name: '', count: 0 })
    const res = await POST(req)
    const json = await parseJSON<{
      success: boolean
      errorCode: string
      i18nKey: string
    }>(res)

    expect(res.status).toBe(400)
    expect(json.success).toBe(false)
    expect(json.errorCode).toBe('VALIDATION_ERROR')
    expect(json.i18nKey).toBe('errors.validation.invalidInput')
  })

  it('returns 400 when required fields are missing', async () => {
    const req = createPOST('/api/test', { name: 'hello' })
    const res = await POST(req)

    expect(res.status).toBe(400)
  })

  // ── GenerationError Handling ──

  it('returns mapped status for ProviderError', async () => {
    mockHandler.mockRejectedValue(
      new ProviderError('huggingface', 'Model unavailable'),
    )
    const req = createPOST('/api/test', { name: 'a', count: 1 })
    const res = await POST(req)
    const json = await parseJSON<{
      success: boolean
      errorCode: string
      i18nKey: string
    }>(res)

    expect(res.status).toBe(502)
    expect(json.success).toBe(false)
    expect(json.errorCode).toBe('PROVIDER_ERROR')
    expect(json.i18nKey).toBe('errors.provider.failed')
  })

  it('returns 504 for timeout ProviderError', async () => {
    mockHandler.mockRejectedValue(
      new ProviderError('gemini', 'Timed out', { timeout: true }),
    )
    const req = createPOST('/api/test', { name: 'a', count: 1 })
    const res = await POST(req)

    expect(res.status).toBe(504)
  })

  it('returns 403 for InsufficientCreditsError', async () => {
    mockHandler.mockRejectedValue(new InsufficientCreditsError())
    const req = createPOST('/api/test', { name: 'a', count: 1 })
    const res = await POST(req)
    const json = await parseJSON<{
      success: boolean
      errorCode: string
    }>(res)

    expect(res.status).toBe(403)
    expect(json.errorCode).toBe('FREE_LIMIT_EXCEEDED')
  })

  it('returns 400 for GenerationValidationError thrown by handler', async () => {
    mockHandler.mockRejectedValue(
      new GenerationValidationError([{ field: 'prompt', message: 'Too long' }]),
    )
    const req = createPOST('/api/test', { name: 'a', count: 1 })
    const res = await POST(req)

    expect(res.status).toBe(400)
  })

  // ── Legacy Service Error ──

  it('handles legacy GenerateImageServiceError', async () => {
    const legacyError = Object.assign(new Error('Out of credits'), {
      code: 'FREE_LIMIT_EXCEEDED',
      status: 402,
      name: 'GenerateImageServiceError',
    })
    mockHandler.mockRejectedValue(legacyError)
    mockIsServiceError.mockReturnValue(true)

    const req = createPOST('/api/test', { name: 'a', count: 1 })
    const res = await POST(req)
    const json = await parseJSON<{
      success: boolean
      error: string
      errorCode: string
    }>(res)

    expect(res.status).toBe(402)
    expect(json.success).toBe(false)
    expect(json.error).toBe('Out of credits')
    expect(json.errorCode).toBe('FREE_LIMIT_EXCEEDED')
  })

  // ── Unknown Error ──

  it('returns 500 for unknown errors', async () => {
    mockHandler.mockRejectedValue(new Error('Something broke'))
    const req = createPOST('/api/test', { name: 'a', count: 1 })
    const res = await POST(req)
    const json = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(500)
    expect(json.success).toBe(false)
    expect(json.error).toBe('An unexpected error occurred. Please try again.')
  })

  it('returns 503 for database quota errors', async () => {
    mockHandler.mockRejectedValue(
      new Error(
        'Your project has exceeded the data transfer quota. Upgrade your plan to increase limits.',
      ),
    )

    const req = createPOST('/api/test', { name: 'a', count: 1 })
    const res = await POST(req)
    const json = await parseJSON<{
      success: boolean
      error: string
      errorCode: string
      i18nKey: string
    }>(res)

    expect(res.status).toBe(503)
    expect(json.success).toBe(false)
    expect(json.errorCode).toBe('DATABASE_QUOTA_EXCEEDED')
    expect(json.i18nKey).toBe('errors.common.databaseUnavailable')
  })

  it('returns 500 for non-Error thrown values', async () => {
    mockHandler.mockRejectedValue('string error')
    const req = createPOST('/api/test', { name: 'a', count: 1 })
    const res = await POST(req)

    expect(res.status).toBe(500)
  })
})
