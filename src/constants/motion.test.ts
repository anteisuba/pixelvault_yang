import { describe, expect, it } from 'vitest'

import {
  DURATION,
  DURATION_MS,
  EASE_STANDARD,
  EASE_STANDARD_CSS,
  STAGGER_MAX_S,
  STAGGER_STEP_S,
  motionTransition,
  staggerDelay,
} from './motion'

describe('motion canon', () => {
  it('keeps the seconds and milliseconds scales in sync', () => {
    for (const key of Object.keys(DURATION) as (keyof typeof DURATION)[]) {
      expect(DURATION_MS[key]).toBe(Math.round(DURATION[key] * 1000))
    }
  })

  it('keeps the scale strictly increasing (fast < base < slow < reveal)', () => {
    expect(DURATION.fast).toBeLessThan(DURATION.base)
    expect(DURATION.base).toBeLessThan(DURATION.slow)
    expect(DURATION.slow).toBeLessThan(DURATION.reveal)
  })

  it('keeps the CSS easing string in sync with the framer array', () => {
    expect(EASE_STANDARD_CSS).toBe(`cubic-bezier(${EASE_STANDARD.join(', ')})`)
  })

  it('caps stagger delay at the max', () => {
    expect(staggerDelay(0)).toBe(0)
    expect(staggerDelay(2)).toBeCloseTo(STAGGER_STEP_S * 2)
    expect(staggerDelay(100)).toBe(STAGGER_MAX_S)
  })

  it('zeroes duration when reduced motion is requested', () => {
    expect(motionTransition('slow', true).duration).toBe(0)
    expect(motionTransition('slow', null).duration).toBe(DURATION.slow)
    expect(motionTransition('fast').duration).toBe(DURATION.fast)
    expect(motionTransition('fast').ease).toBe(EASE_STANDARD)
  })
})
