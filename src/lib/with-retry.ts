/**
 * Retry utility with exponential backoff + jitter.
 *
 * Usage:
 *   const result = await withRetry(
 *     () => providerAdapter.generateImage(params),
 *     { maxAttempts: 3, baseDelayMs: 1000 }
 *   )
 *
 * Retries on transient errors (5xx, timeouts, network).
 * Does NOT retry on 4xx (bad request, auth, rate limit).
 */

import { logger } from '@/lib/logger'

export interface RetryOptions {
  /** Maximum number of attempts (default: 3) */
  maxAttempts?: number
  /** Base delay in ms before first retry (default: 1000) */
  baseDelayMs?: number
  /** Maximum delay cap in ms (default: 15000) */
  maxDelayMs?: number
  /** Label for logging (e.g. 'fal.generateImage') */
  label?: string
  /** Custom function to decide if error is retryable (default: retry on 5xx/network) */
  isRetryable?: (error: unknown) => boolean
}

/** Default retryable check: retry on 5xx, timeouts, and network errors */
function defaultIsRetryable(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    // Network / timeout errors
    if (
      msg.includes('timeout') ||
      msg.includes('econnreset') ||
      msg.includes('econnrefused') ||
      msg.includes('fetch failed') ||
      msg.includes('network') ||
      msg.includes('socket hang up')
    ) {
      return true
    }
  }

  // Check for HTTP status in error object
  const status = (error as { status?: number })?.status
  if (typeof status === 'number') {
    // Retry on 5xx and 429 (rate limit — with backoff)
    return status >= 500 || status === 429
  }

  return false
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 1000,
    maxDelayMs = 15_000,
    label = 'withRetry',
    isRetryable = defaultIsRetryable,
  } = options

  let lastError: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      if (attempt === maxAttempts || !isRetryable(error)) {
        throw error
      }

      // Exponential backoff with jitter
      const exponentialDelay = baseDelayMs * Math.pow(2, attempt - 1)
      const jitter = Math.random() * baseDelayMs * 0.5
      const delay = Math.min(exponentialDelay + jitter, maxDelayMs)

      logger.warn(
        `${label}: attempt ${attempt}/${maxAttempts} failed, retrying in ${Math.round(delay)}ms`,
        {
          attempt,
          maxAttempts,
          delayMs: Math.round(delay),
          error: error instanceof Error ? error.message : String(error),
        },
      )

      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw lastError
}
