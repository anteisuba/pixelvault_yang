import { describe, expect, it } from 'vitest'

import { formatCompactNumber } from './format-compact-number'

describe('formatCompactNumber', () => {
  it('leaves sub-thousand counts intact', () => {
    expect(formatCompactNumber(0)).toBe('0')
    expect(formatCompactNumber(7)).toBe('7')
    expect(formatCompactNumber(999)).toBe('999')
  })

  it('collapses thousands with one decimal below ten', () => {
    expect(formatCompactNumber(1_000)).toBe('1k')
    expect(formatCompactNumber(1_240)).toBe('1.2k')
    expect(formatCompactNumber(9_990)).toBe('9.9k')
    expect(formatCompactNumber(43_120)).toBe('43k')
    expect(formatCompactNumber(444_000)).toBe('444k')
  })

  it('collapses millions and billions', () => {
    expect(formatCompactNumber(1_500_000)).toBe('1.5M')
    expect(formatCompactNumber(23_000_000)).toBe('23M')
    expect(formatCompactNumber(2_400_000_000)).toBe('2.4B')
  })

  it('never emits a trailing .0 and rejects junk input', () => {
    expect(formatCompactNumber(2_000)).toBe('2k')
    expect(formatCompactNumber(Number.NaN)).toBe('0')
    expect(formatCompactNumber(-5)).toBe('0')
  })
})
