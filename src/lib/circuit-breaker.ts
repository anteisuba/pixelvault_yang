/**
 * Circuit breaker for external service calls (AI providers, R2, etc).
 *
 * States:
 *   CLOSED  → normal operation, requests pass through
 *   OPEN    → too many failures, requests fail fast
 *   HALF_OPEN → testing if service recovered (allows one probe request)
 *
 * Usage:
 *   const breaker = new CircuitBreaker('fal', { failureThreshold: 5 })
 *   const result = await breaker.call(() => fal.generateImage(params))
 */

import { logger } from '@/lib/logger'

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'

export interface CircuitBreakerOptions {
  /** Failures needed to trip the circuit (default: 5) */
  failureThreshold?: number
  /** How long to stay OPEN before trying HALF_OPEN, in ms (default: 30000) */
  resetTimeoutMs?: number
  /** Window to count failures in, in ms (default: 60000) */
  failureWindowMs?: number
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED'
  private failures: number[] = []
  private lastFailureTime = 0
  private readonly name: string
  private readonly failureThreshold: number
  private readonly resetTimeoutMs: number
  private readonly failureWindowMs: number

  constructor(name: string, options: CircuitBreakerOptions = {}) {
    this.name = name
    this.failureThreshold = options.failureThreshold ?? 5
    this.resetTimeoutMs = options.resetTimeoutMs ?? 30_000
    this.failureWindowMs = options.failureWindowMs ?? 60_000
  }

  get currentState(): CircuitState {
    if (this.state === 'OPEN') {
      const elapsed = Date.now() - this.lastFailureTime
      if (elapsed >= this.resetTimeoutMs) {
        this.state = 'HALF_OPEN'
        logger.info(`Circuit ${this.name}: OPEN → HALF_OPEN (testing recovery)`)
      }
    }
    return this.state
  }

  async call<T>(fn: () => Promise<T>): Promise<T> {
    const state = this.currentState

    if (state === 'OPEN') {
      throw new CircuitOpenError(
        `Circuit breaker ${this.name} is OPEN — failing fast. ` +
          `Resets in ${Math.round((this.resetTimeoutMs - (Date.now() - this.lastFailureTime)) / 1000)}s`,
      )
    }

    try {
      const result = await fn()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      throw error
    }
  }

  private onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      logger.info(`Circuit ${this.name}: HALF_OPEN → CLOSED (recovered)`)
    }
    this.state = 'CLOSED'
    this.failures = []
  }

  private onFailure(): void {
    const now = Date.now()
    this.lastFailureTime = now

    // Only count failures within the window
    this.failures = this.failures.filter((t) => now - t < this.failureWindowMs)
    this.failures.push(now)

    if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN'
      logger.warn(`Circuit ${this.name}: HALF_OPEN → OPEN (probe failed)`)
      return
    }

    if (this.failures.length >= this.failureThreshold) {
      this.state = 'OPEN'
      logger.error(
        `Circuit ${this.name}: CLOSED → OPEN (${this.failures.length} failures in ${this.failureWindowMs}ms)`,
        {
          failureCount: this.failures.length,
          threshold: this.failureThreshold,
        },
      )
    }
  }

  /** Force reset to CLOSED (for admin/testing) */
  reset(): void {
    this.state = 'CLOSED'
    this.failures = []
    logger.info(`Circuit ${this.name}: manually reset to CLOSED`)
  }
}

export class CircuitOpenError extends Error {
  readonly isCircuitOpen = true
  constructor(message: string) {
    super(message)
    this.name = 'CircuitOpenError'
  }
}

// ─── Pre-built breakers per provider ───────────────────────────

const breakers = new Map<string, CircuitBreaker>()

/** Get or create a circuit breaker for a given provider/service name. */
export function getCircuitBreaker(
  name: string,
  options?: CircuitBreakerOptions,
): CircuitBreaker {
  let breaker = breakers.get(name)
  if (!breaker) {
    breaker = new CircuitBreaker(name, options)
    breakers.set(name, breaker)
  }
  return breaker
}
