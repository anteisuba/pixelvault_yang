import { afterEach, describe, expect, it, vi } from 'vitest'
import { canUseQwenEvaluation } from './qwen-evaluation-access'

describe('canUseQwenEvaluation', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('keeps local evaluation available', () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect(canUseQwenEvaluation('user-1')).toBe(true)
  })

  it('requires an exact private allowlist match in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('QWEN_EVALUATION_USER_IDS', ' user-1, user-2 , ')
    expect(canUseQwenEvaluation('user-1')).toBe(true)
    expect(canUseQwenEvaluation('user-2')).toBe(true)
    expect(canUseQwenEvaluation('user')).toBe(false)
    expect(canUseQwenEvaluation('')).toBe(false)
  })

  it('denies production access when the allowlist is absent', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('QWEN_EVALUATION_USER_IDS', undefined)
    expect(canUseQwenEvaluation('user-1')).toBe(false)
  })
})
