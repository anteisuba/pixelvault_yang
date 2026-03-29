/**
 * Distributed rate limiter using Upstash Redis.
 * Shared across all Vercel serverless instances.
 *
 * Falls back to in-memory limiting if Redis is unavailable.
 */

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { logger } from '@/lib/logger'

// ─── Redis Client ───────────────────────────────────────────────

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

// ─── Rate Limiter Cache ─────────────────────────────────────────
// Cache Ratelimit instances by config to avoid creating new ones each call

const limiters = new Map<string, Ratelimit>()

function getLimiter(limit: number, windowSeconds: number): Ratelimit {
  const cacheKey = `${limit}:${windowSeconds}`
  let limiter = limiters.get(cacheKey)
  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`),
      analytics: true,
      prefix: 'pv:rl',
    })
    limiters.set(cacheKey, limiter)
  }
  return limiter
}

// ─── In-Memory Fallback ─────────────────────────────────────────

interface MemoryEntry {
  tokens: number
  lastRefill: number
}

const memoryStore = new Map<string, MemoryEntry>()

function memoryRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): RateLimitResult {
  const now = Date.now()
  const windowMs = windowSeconds * 1000

  let entry = memoryStore.get(key)
  if (!entry) {
    entry = { tokens: limit - 1, lastRefill: now }
    memoryStore.set(key, entry)
    return { success: true, remaining: entry.tokens }
  }

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

// ─── Public API ─────────────────────────────────────────────────

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

/**
 * Rate limit a key using distributed Redis (Upstash).
 * Falls back to in-memory if Redis is unavailable.
 */
export async function rateLimit(
  key: string,
  { limit, windowSeconds }: RateLimitOptions,
): Promise<RateLimitResult> {
  try {
    const limiter = getLimiter(limit, windowSeconds)
    const result = await limiter.limit(key)
    return {
      success: result.success,
      remaining: result.remaining,
    }
  } catch (error) {
    // Redis down — fall back to in-memory (still better than no limiting)
    logger.warn('Redis rate limit unavailable, using in-memory fallback', {
      error: error instanceof Error ? error.message : String(error),
      key,
    })
    return memoryRateLimit(key, limit, windowSeconds)
  }
}
