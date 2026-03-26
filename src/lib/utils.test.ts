import { describe, it, expect } from 'vitest'

import { invertReferenceStrength } from '@/lib/utils'

describe('invertReferenceStrength', () => {
  it('inverts the reference strength value', () => {
    expect(invertReferenceStrength(0.7)).toBeCloseTo(0.3)
    expect(invertReferenceStrength(0.5)).toBeCloseTo(0.5)
    expect(invertReferenceStrength(0.3)).toBeCloseTo(0.7)
  })

  it('clamps result to [0.01, 0.99]', () => {
    // At boundaries
    expect(invertReferenceStrength(0.01)).toBeCloseTo(0.99)
    expect(invertReferenceStrength(0.99)).toBeCloseTo(0.01)
  })

  it('clamps when input would produce out-of-range result', () => {
    // Input 0 would give 1.0, clamped to 0.99
    expect(invertReferenceStrength(0)).toBe(0.99)
    // Input 1 would give 0.0, clamped to 0.01
    expect(invertReferenceStrength(1)).toBe(0.01)
    // Negative input clamped to 0.99
    expect(invertReferenceStrength(-0.5)).toBe(0.99)
    // Input > 1 clamped to 0.01
    expect(invertReferenceStrength(1.5)).toBe(0.01)
  })
})
