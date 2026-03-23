/**
 * Simple in-memory rate limiter using a sliding window.
 * Suitable for single-instance or Vercel serverless (per-instance protection).
 * For production-scale, replace with upstash/ratelimit + Redis.
 */

interface RateLimitEntry {
  tokens: number
  lastRefill: number
}

const store = new Map<string, RateLimitEntry>()

// Periodic cleanup to prevent memory leaks
const CLEANUP_INTERVAL_MS = 60_000
let lastCleanup = Date.now()

function cleanup() {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return
  lastCleanup = now

  const expiry = now - 120_000 // Remove entries older than 2 min
  for (const [key, entry] of store) {
    if (entry.lastRefill < expiry) {
      store.delete(key)
    }
  }
}

interface RateLimitOptions {
  /** Max requests in the window */
  limit: number
  /** Window size in seconds */
  windowSeconds: number
}

interface RateLimitResult {
  success: boolean
  remaining: number
}

export function rateLimit(
  key: string,
  { limit, windowSeconds }: RateLimitOptions,
): RateLimitResult {
  cleanup()

  const now = Date.now()
  const windowMs = windowSeconds * 1000

  let entry = store.get(key)

  if (!entry) {
    entry = { tokens: limit - 1, lastRefill: now }
    store.set(key, entry)
    return { success: true, remaining: entry.tokens }
  }

  // Token bucket refill
  const elapsed = now - entry.lastRefill
  const refill = Math.floor((elapsed / windowMs) * limit)

  if (refill > 0) {
    entry.tokens = Math.min(limit, entry.tokens + refill)
    entry.lastRefill = now
  }

  if (entry.tokens <= 0) {
    return { success: false, remaining: 0 }
  }

  entry.tokens -= 1
  return { success: true, remaining: entry.tokens }
}
