import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import {
  CircuitBreaker,
  CircuitOpenError,
  getCircuitBreaker,
} from './circuit-breaker'

// Reset the singleton map between tests by re-importing fresh module
beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('CircuitBreaker state transitions', () => {
  it('starts in CLOSED state', () => {
    const cb = new CircuitBreaker('test')
    expect(cb.currentState).toBe('CLOSED')
  })

  it('successful calls keep CLOSED', async () => {
    const cb = new CircuitBreaker('test')
    await cb.call(() => Promise.resolve('ok'))
    await cb.call(() => Promise.resolve('ok'))
    expect(cb.currentState).toBe('CLOSED')
  })

  it('single failure stays CLOSED', async () => {
    const cb = new CircuitBreaker('test', { failureThreshold: 5 })
    await expect(
      cb.call(() => Promise.reject(new Error('fail'))),
    ).rejects.toThrow('fail')
    expect(cb.currentState).toBe('CLOSED')
  })

  it('N failures (= threshold) within window transitions to OPEN', async () => {
    const cb = new CircuitBreaker('test', { failureThreshold: 3 })
    for (let i = 0; i < 3; i++) {
      await expect(
        cb.call(() => Promise.reject(new Error('fail'))),
      ).rejects.toThrow('fail')
    }
    expect(cb.currentState).toBe('OPEN')
  })

  it('OPEN state: call() throws CircuitOpenError immediately', async () => {
    const cb = new CircuitBreaker('test', { failureThreshold: 2 })
    // Trip the circuit
    for (let i = 0; i < 2; i++) {
      await expect(
        cb.call(() => Promise.reject(new Error('fail'))),
      ).rejects.toThrow()
    }
    expect(cb.currentState).toBe('OPEN')

    // The fn should never be called
    const fn = vi.fn(() => Promise.resolve('should not run'))
    await expect(cb.call(fn)).rejects.toThrow(CircuitOpenError)
    expect(fn).not.toHaveBeenCalled()
  })

  it('OPEN -> HALF_OPEN after resetTimeoutMs', async () => {
    const cb = new CircuitBreaker('test', {
      failureThreshold: 2,
      resetTimeoutMs: 5000,
    })
    // Trip the circuit
    for (let i = 0; i < 2; i++) {
      await expect(
        cb.call(() => Promise.reject(new Error('fail'))),
      ).rejects.toThrow()
    }
    expect(cb.currentState).toBe('OPEN')

    // Advance time past resetTimeoutMs
    vi.advanceTimersByTime(5000)
    expect(cb.currentState).toBe('HALF_OPEN')
  })

  it('HALF_OPEN + success -> CLOSED', async () => {
    const cb = new CircuitBreaker('test', {
      failureThreshold: 2,
      resetTimeoutMs: 5000,
    })
    // Trip the circuit
    for (let i = 0; i < 2; i++) {
      await expect(
        cb.call(() => Promise.reject(new Error('fail'))),
      ).rejects.toThrow()
    }
    expect(cb.currentState).toBe('OPEN')

    // Move to HALF_OPEN
    vi.advanceTimersByTime(5000)
    expect(cb.currentState).toBe('HALF_OPEN')

    // Successful probe -> CLOSED
    await cb.call(() => Promise.resolve('recovered'))
    expect(cb.currentState).toBe('CLOSED')
  })

  it('HALF_OPEN + failure -> OPEN', async () => {
    const cb = new CircuitBreaker('test', {
      failureThreshold: 2,
      resetTimeoutMs: 5000,
    })
    // Trip the circuit
    for (let i = 0; i < 2; i++) {
      await expect(
        cb.call(() => Promise.reject(new Error('fail'))),
      ).rejects.toThrow()
    }
    expect(cb.currentState).toBe('OPEN')

    // Move to HALF_OPEN
    vi.advanceTimersByTime(5000)
    expect(cb.currentState).toBe('HALF_OPEN')

    // Failed probe -> OPEN
    await expect(
      cb.call(() => Promise.reject(new Error('still broken'))),
    ).rejects.toThrow('still broken')
    expect(cb.currentState).toBe('OPEN')
  })

  it('failures outside window are not counted (expire)', async () => {
    const cb = new CircuitBreaker('test', {
      failureThreshold: 3,
      failureWindowMs: 10_000,
    })

    // Two failures at t=0
    for (let i = 0; i < 2; i++) {
      await expect(
        cb.call(() => Promise.reject(new Error('fail'))),
      ).rejects.toThrow()
    }
    expect(cb.currentState).toBe('CLOSED')

    // Advance time past the window so the first two failures expire
    vi.advanceTimersByTime(11_000)

    // One more failure — only 1 in-window, should stay CLOSED
    await expect(
      cb.call(() => Promise.reject(new Error('fail'))),
    ).rejects.toThrow()
    expect(cb.currentState).toBe('CLOSED')
  })

  it('reset() forces CLOSED', async () => {
    const cb = new CircuitBreaker('test', { failureThreshold: 2 })
    // Trip the circuit
    for (let i = 0; i < 2; i++) {
      await expect(
        cb.call(() => Promise.reject(new Error('fail'))),
      ).rejects.toThrow()
    }
    expect(cb.currentState).toBe('OPEN')

    // Manual reset
    cb.reset()
    expect(cb.currentState).toBe('CLOSED')

    // Should be able to call again
    const result = await cb.call(() => Promise.resolve('working'))
    expect(result).toBe('working')
  })
})

describe('getCircuitBreaker', () => {
  it('returns same instance for same name (singleton)', () => {
    const a = getCircuitBreaker('provider-a')
    const b = getCircuitBreaker('provider-a')
    expect(a).toBe(b)
  })

  it('different names get different instances', () => {
    const a = getCircuitBreaker('provider-x')
    const b = getCircuitBreaker('provider-y')
    expect(a).not.toBe(b)
  })
})

describe('CircuitOpenError', () => {
  it('has isCircuitOpen = true', () => {
    const err = new CircuitOpenError('circuit is open')
    expect(err.isCircuitOpen).toBe(true)
  })

  it('has correct name', () => {
    const err = new CircuitOpenError('circuit is open')
    expect(err.name).toBe('CircuitOpenError')
  })
})
