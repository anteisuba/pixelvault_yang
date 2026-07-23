import 'server-only'

import { Redis } from '@upstash/redis'

const NONCE_PREFIX = 'pv:execution-nonce'
const memoryNonces = new Map<string, number>()

let redisClient: Redis | null = null
let redisIdentity = ''

function getConfiguredRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null

  const identity = `${url}\u0000${token}`
  if (!redisClient || redisIdentity !== identity) {
    redisClient = new Redis({ url, token })
    redisIdentity = identity
  }

  return redisClient
}

function consumeMemoryNonce(
  nonce: string,
  expiresAtMs: number,
  nowMs: number,
): boolean {
  for (const [key, expiry] of memoryNonces) {
    if (expiry <= nowMs) memoryNonces.delete(key)
  }

  const existingExpiry = memoryNonces.get(nonce)
  if (existingExpiry && existingExpiry > nowMs) return false

  memoryNonces.set(nonce, expiresAtMs)
  return true
}

/**
 * Atomically consume one signed-request nonce.
 *
 * Production requires distributed Redis so separate Vercel instances share
 * replay state. Tests and local development may use the bounded, TTL-cleaned
 * in-memory adapter.
 */
export async function consumeExecutionNonce(
  nonce: string,
  ttlSeconds: number,
  nowMs = Date.now(),
): Promise<boolean> {
  const redis = getConfiguredRedis()
  if (redis) {
    try {
      const result = await redis.set(`${NONCE_PREFIX}:${nonce}`, '1', {
        nx: true,
        ex: ttlSeconds,
      })
      return result === 'OK'
    } catch (error) {
      if (process.env.NODE_ENV === 'production') throw error
    }
  } else if (process.env.NODE_ENV === 'production') {
    throw new Error('Distributed execution replay guard is not configured.')
  }

  return consumeMemoryNonce(nonce, nowMs + ttlSeconds * 1000, nowMs)
}
