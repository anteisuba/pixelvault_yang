import { describe, it, expect } from 'vitest'

import { AdvancedParamsSchema } from '@/types'

describe('AdvancedParamsSchema', () => {
  it('accepts empty object', () => {
    const result = AdvancedParamsSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('accepts all valid fields', () => {
    const result = AdvancedParamsSchema.safeParse({
      negativePrompt: 'blurry, low quality',
      guidanceScale: 7.5,
      steps: 30,
      seed: 42,
      referenceStrength: 0.7,
      quality: 'high',
      background: 'transparent',
      style: 'vivid',
    })
    expect(result.success).toBe(true)
    expect(result.data).toEqual({
      negativePrompt: 'blurry, low quality',
      guidanceScale: 7.5,
      steps: 30,
      seed: 42,
      referenceStrength: 0.7,
      quality: 'high',
      background: 'transparent',
      style: 'vivid',
    })
  })

  it('accepts partial fields', () => {
    const result = AdvancedParamsSchema.safeParse({
      guidanceScale: 5,
      seed: 100,
    })
    expect(result.success).toBe(true)
    expect(result.data?.guidanceScale).toBe(5)
    expect(result.data?.seed).toBe(100)
    expect(result.data?.negativePrompt).toBeUndefined()
  })

  it('rejects guidanceScale out of range', () => {
    const result = AdvancedParamsSchema.safeParse({ guidanceScale: 999 })
    expect(result.success).toBe(false)
  })

  it('rejects negative guidanceScale', () => {
    const result = AdvancedParamsSchema.safeParse({ guidanceScale: -1 })
    expect(result.success).toBe(false)
  })

  it('rejects steps out of range', () => {
    const result = AdvancedParamsSchema.safeParse({ steps: 0 })
    expect(result.success).toBe(false)
    const result2 = AdvancedParamsSchema.safeParse({ steps: 200 })
    expect(result2.success).toBe(false)
  })

  it('rejects non-integer steps', () => {
    const result = AdvancedParamsSchema.safeParse({ steps: 10.5 })
    expect(result.success).toBe(false)
  })

  it('rejects referenceStrength out of range', () => {
    const below = AdvancedParamsSchema.safeParse({ referenceStrength: 0 })
    expect(below.success).toBe(false)
    const above = AdvancedParamsSchema.safeParse({ referenceStrength: 1.0 })
    expect(above.success).toBe(false)
  })

  it('accepts referenceStrength at boundary values', () => {
    const min = AdvancedParamsSchema.safeParse({ referenceStrength: 0.01 })
    expect(min.success).toBe(true)
    const max = AdvancedParamsSchema.safeParse({ referenceStrength: 0.99 })
    expect(max.success).toBe(true)
  })

  it('rejects seed out of range', () => {
    const result = AdvancedParamsSchema.safeParse({ seed: -2 })
    expect(result.success).toBe(false)
    const result2 = AdvancedParamsSchema.safeParse({ seed: 4294967296 })
    expect(result2.success).toBe(false)
  })

  it('accepts seed value of -1 (random)', () => {
    const result = AdvancedParamsSchema.safeParse({ seed: -1 })
    expect(result.success).toBe(true)
  })

  it('rejects negativePrompt exceeding max length', () => {
    const result = AdvancedParamsSchema.safeParse({
      negativePrompt: 'x'.repeat(2001),
    })
    expect(result.success).toBe(false)
  })
})
