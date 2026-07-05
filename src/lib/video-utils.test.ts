import { describe, expect, it } from 'vitest'

import { formatTimecode } from './video-utils'

describe('formatTimecode', () => {
  it('formats seconds as HH:MM:SS', () => {
    expect(formatTimecode(0)).toBe('00:00:00')
    expect(formatTimecode(42)).toBe('00:00:42')
    expect(formatTimecode(65)).toBe('00:01:05')
    expect(formatTimecode(3661)).toBe('01:01:01')
  })

  it('floors fractional seconds and clamps negatives to zero', () => {
    expect(formatTimecode(42.9)).toBe('00:00:42')
    expect(formatTimecode(-5)).toBe('00:00:00')
  })
})
