import { afterEach, describe, expect, it, vi } from 'vitest'

import { isFeatureEnabledForUser } from './feature-flags'

vi.mock('@/constants/feature-flags', () => ({
  FEATURE_FLAGS: {
    smartPrompt: true,
    variantGeneration: true,
    multiModelCompare: false,
    imageEditing: true,
    seriesMode: true,
  },
}))

const ORIGINAL_ENV = { ...process.env }

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('isFeatureEnabledForUser', () => {
  it('returns false when the flag is globally off', () => {
    expect(isFeatureEnabledForUser('multiModelCompare', 'user_1')).toBe(false)
  })

  it('returns true when flag is on and no rollout env is set', () => {
    delete process.env.NEXT_PUBLIC_FF_SMART_PROMPT_ROLLOUT
    expect(isFeatureEnabledForUser('smartPrompt', 'user_1')).toBe(true)
  })

  it('returns true when rollout=100', () => {
    process.env.NEXT_PUBLIC_FF_VARIANT_GEN_ROLLOUT = '100'
    expect(isFeatureEnabledForUser('variantGeneration', 'user_1')).toBe(true)
  })

  it('returns false when rollout=0', () => {
    process.env.NEXT_PUBLIC_FF_VARIANT_GEN_ROLLOUT = '0'
    expect(isFeatureEnabledForUser('variantGeneration', 'user_1')).toBe(false)
  })

  it('is sticky for the same userId', () => {
    process.env.NEXT_PUBLIC_FF_VARIANT_GEN_ROLLOUT = '50'
    const result1 = isFeatureEnabledForUser('variantGeneration', 'user_X')
    const result2 = isFeatureEnabledForUser('variantGeneration', 'user_X')
    expect(result1).toBe(result2)
  })

  it('rejects anonymous users from partial rollouts', () => {
    process.env.NEXT_PUBLIC_FF_VARIANT_GEN_ROLLOUT = '50'
    expect(isFeatureEnabledForUser('variantGeneration', null)).toBe(false)
    expect(isFeatureEnabledForUser('variantGeneration', undefined)).toBe(false)
  })

  it('partitions a uniform set of users roughly along the rollout boundary', () => {
    process.env.NEXT_PUBLIC_FF_VARIANT_GEN_ROLLOUT = '25'
    let enabled = 0
    for (let i = 0; i < 1000; i++) {
      if (isFeatureEnabledForUser('variantGeneration', `user_${i}`)) {
        enabled++
      }
    }
    // 25% target, allow ±10pp band on a 1k sample
    expect(enabled).toBeGreaterThan(150)
    expect(enabled).toBeLessThan(350)
  })
})
