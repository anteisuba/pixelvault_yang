import { describe, expect, it } from 'vitest'

import { IMAGE_SIZES } from '@/constants/config'
import {
  clampRunnerDimensionsToNative,
  getRunnerNativeDimensions,
  RUNNER_NATIVE_DIMENSIONS,
  RUNNER_NATIVE_MAX_PIXELS,
} from '@/constants/runner-dimensions'

describe('RUNNER_NATIVE_DIMENSIONS', () => {
  it('covers every supported aspect ratio', () => {
    expect(Object.keys(RUNNER_NATIVE_DIMENSIONS).sort()).toEqual(
      Object.keys(IMAGE_SIZES).sort(),
    )
  })

  it('keeps every bucket at ~1MP (SDXL / DiT training size), multiple of 8', () => {
    for (const { width, height } of Object.values(RUNNER_NATIVE_DIMENSIONS)) {
      const pixels = width * height
      expect(pixels).toBeGreaterThanOrEqual(0.9 * 1024 * 1024)
      expect(pixels).toBeLessThanOrEqual(1.1 * 1024 * 1024)
      expect(width % 8).toBe(0)
      expect(height % 8).toBe(0)
    }
  })

  it('gives SDXL 16:9 the 1344×768 bucket, not 1792×1024', () => {
    expect(getRunnerNativeDimensions('16:9')).toEqual({
      width: 1344,
      height: 768,
    })
    expect(getRunnerNativeDimensions('9:16')).toEqual({
      width: 768,
      height: 1344,
    })
  })

  it('falls back to 1:1 for an unknown ratio', () => {
    expect(getRunnerNativeDimensions('21:9')).toEqual({
      width: 1024,
      height: 1024,
    })
  })
})

describe('clampRunnerDimensionsToNative', () => {
  it('keeps a source size that is within the native band', () => {
    expect(clampRunnerDimensionsToNative(832, 1216)).toEqual({
      width: 832,
      height: 1216,
    })
    // WAI author's own example size (≈1.38MP) stays as written.
    expect(clampRunnerDimensionsToNative(1024, 1344)).toEqual({
      width: 1024,
      height: 1344,
    })
  })

  it('scales an oversized source back to ~1MP at the same ratio, aligned to 64', () => {
    const out = clampRunnerDimensionsToNative(1536, 1536)
    expect(out).toEqual({ width: 1024, height: 1024 })
    const wide = clampRunnerDimensionsToNative(1920, 1080)
    expect(wide).toEqual({ width: 1344, height: 768 })
    expect(wide.width * wide.height).toBeLessThanOrEqual(
      RUNNER_NATIVE_MAX_PIXELS,
    )
  })
})
