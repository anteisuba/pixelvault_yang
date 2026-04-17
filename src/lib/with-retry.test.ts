/**
 * WP-Infra-01 · with-retry unit tests
 *
 * 7 paths:
 *   1. 5xx retry → success on 2nd attempt
 *   2. 429 retry → success on 2nd attempt
 *   3. 4xx does NOT retry (throws immediately)
 *   4. Zod ValidationError does NOT retry
 *   5. maxAttempts exhausted → throws original error
 *   6. Exponential backoff + jitter verification
 *   7. Custom isRetryable function
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

import { withRetry } from './with-retry'

// Suppress logger output during tests
vi.mock('@/lib/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}))

// ─── Helpers ────────────────────────────────────────────────────

class HttpError extends Error {
  status: number
  constructor(status: number, message = `HTTP ${status}`) {
    super(message)
    this.status = status
  }
}

// ─── Tests ──────────────────────────────────────────────────────

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('retries on 5xx and succeeds on 2nd attempt', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new HttpError(502, 'Bad Gateway'))
      .mockResolvedValueOnce('ok')

    const promise = withRetry(fn, {
      maxAttempts: 3,
      baseDelayMs: 100,
      label: 'test-5xx',
    })

    // Advance past the backoff delay
    await vi.advanceTimersByTimeAsync(200)

    const result = await promise
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('retries on 429 (rate limit) and succeeds on 2nd attempt', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new HttpError(429, 'Rate limited'))
      .mockResolvedValueOnce('ok')

    const promise = withRetry(fn, {
      maxAttempts: 3,
      baseDelayMs: 100,
      label: 'test-429',
    })

    await vi.advanceTimersByTimeAsync(200)

    const result = await promise
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('does NOT retry on 4xx (throws immediately)', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new HttpError(400, 'Bad Request'))

    await expect(
      withRetry(fn, { maxAttempts: 3, baseDelayMs: 100 }),
    ).rejects.toThrow('Bad Request')

    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('does NOT retry on non-retryable errors (e.g. validation)', async () => {
    const validationError = new Error('Validation failed')

    const fn = vi.fn().mockRejectedValueOnce(validationError)

    await expect(
      withRetry(fn, { maxAttempts: 3, baseDelayMs: 100 }),
    ).rejects.toThrow('Validation failed')

    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('throws original error when maxAttempts exhausted', async () => {
    const error = new HttpError(503, 'Service Unavailable')
    const fn = vi.fn().mockRejectedValue(error)

    // Catch the rejection eagerly to avoid unhandled rejection warning
    const promise = withRetry(fn, {
      maxAttempts: 3,
      baseDelayMs: 100,
      label: 'test-exhaust',
    }).catch((e) => e)

    // Advance through all retry delays
    await vi.advanceTimersByTimeAsync(1000)

    const caught = await promise
    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toBe('Service Unavailable')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('uses exponential backoff with jitter', async () => {
    // Seed Math.random for deterministic jitter
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0)

    const fn = vi
      .fn()
      .mockRejectedValueOnce(new HttpError(500))
      .mockRejectedValueOnce(new HttpError(500))
      .mockResolvedValueOnce('ok')

    const promise = withRetry(fn, {
      maxAttempts: 3,
      baseDelayMs: 1000,
      maxDelayMs: 15000,
      label: 'test-backoff',
    })

    // With jitter=0: attempt 1 delay = 1000 * 2^0 + 0 = 1000ms
    await vi.advanceTimersByTimeAsync(1000)
    expect(fn).toHaveBeenCalledTimes(2)

    // With jitter=0: attempt 2 delay = 1000 * 2^1 + 0 = 2000ms
    await vi.advanceTimersByTimeAsync(2000)
    expect(fn).toHaveBeenCalledTimes(3)

    const result = await promise
    expect(result).toBe('ok')

    randomSpy.mockRestore()
  })

  it('respects custom isRetryable function', async () => {
    const customError = new Error('CUSTOM_RETRYABLE')

    const fn = vi
      .fn()
      .mockRejectedValueOnce(customError)
      .mockResolvedValueOnce('ok')

    const promise = withRetry(fn, {
      maxAttempts: 3,
      baseDelayMs: 100,
      isRetryable: (error) =>
        error instanceof Error && error.message === 'CUSTOM_RETRYABLE',
    })

    await vi.advanceTimersByTimeAsync(200)

    const result = await promise
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('retries on network errors (timeout, fetch failed)', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockRejectedValueOnce(new Error('timeout exceeded'))
      .mockResolvedValueOnce('recovered')

    const promise = withRetry(fn, {
      maxAttempts: 3,
      baseDelayMs: 100,
      label: 'test-network',
    })

    await vi.advanceTimersByTimeAsync(500)

    const result = await promise
    expect(result).toBe('recovered')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('caps delay at maxDelayMs', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0)

    const fn = vi
      .fn()
      .mockRejectedValueOnce(new HttpError(500))
      .mockRejectedValueOnce(new HttpError(500))
      .mockRejectedValueOnce(new HttpError(500))
      .mockRejectedValueOnce(new HttpError(500))
      .mockResolvedValueOnce('ok')

    const promise = withRetry(fn, {
      maxAttempts: 5,
      baseDelayMs: 1000,
      maxDelayMs: 5000,
      label: 'test-cap',
    })

    // attempt 1: delay = min(1000, 5000) = 1000
    await vi.advanceTimersByTimeAsync(1000)
    expect(fn).toHaveBeenCalledTimes(2)

    // attempt 2: delay = min(2000, 5000) = 2000
    await vi.advanceTimersByTimeAsync(2000)
    expect(fn).toHaveBeenCalledTimes(3)

    // attempt 3: delay = min(4000, 5000) = 4000
    await vi.advanceTimersByTimeAsync(4000)
    expect(fn).toHaveBeenCalledTimes(4)

    // attempt 4: delay = min(8000, 5000) = 5000 (capped!)
    await vi.advanceTimersByTimeAsync(5000)
    expect(fn).toHaveBeenCalledTimes(5)

    const result = await promise
    expect(result).toBe('ok')

    randomSpy.mockRestore()
  })
})
