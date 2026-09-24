import { describe, expect, it } from 'vitest'

import { formatTimecode, getVideoOutputSize } from './video-utils'

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

describe('getVideoOutputSize', () => {
  it('短边取档位，长边按比例推成偶数', () => {
    expect(getVideoOutputSize('9:16', '480p')).toEqual({
      width: 480,
      height: 854,
    })
    expect(getVideoOutputSize('16:9', '720p')).toEqual({
      width: 1280,
      height: 720,
    })
    expect(getVideoOutputSize('1:1', '1080p')).toEqual({
      width: 1080,
      height: 1080,
    })
  })

  it('没有档位回落到比例默认尺寸', () => {
    expect(getVideoOutputSize('9:16')).toEqual({ width: 1024, height: 1792 })
  })
})
