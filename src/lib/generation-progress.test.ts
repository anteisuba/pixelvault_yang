import { describe, expect, it } from 'vitest'

import {
  computeEstimatedGenerationProgress,
  getGeneratingStageKey,
  resolveGenerationProgress,
} from './generation-progress'

describe('getGeneratingStageKey', () => {
  it('maps elapsed seconds to the right stage', () => {
    expect(getGeneratingStageKey(0)).toBe('preparing')
    expect(getGeneratingStageKey(1.9)).toBe('preparing')
    expect(getGeneratingStageKey(2)).toBe('connecting')
    expect(getGeneratingStageKey(7.9)).toBe('connecting')
    expect(getGeneratingStageKey(8)).toBe('rendering')
    expect(getGeneratingStageKey(44.9)).toBe('rendering')
    expect(getGeneratingStageKey(45)).toBe('waiting')
    expect(getGeneratingStageKey(9999)).toBe('waiting')
  })
})

describe('computeEstimatedGenerationProgress', () => {
  it('starts each stage at its segment start percent', () => {
    expect(computeEstimatedGenerationProgress(0).percent).toBeCloseTo(0)
    expect(computeEstimatedGenerationProgress(2).percent).toBeCloseTo(20)
    expect(computeEstimatedGenerationProgress(8).percent).toBeCloseTo(45)
  })

  it('eases out within a segment (never linear, monotonic)', () => {
    const early = computeEstimatedGenerationProgress(8.5).percent
    const mid = computeEstimatedGenerationProgress(20).percent
    const late = computeEstimatedGenerationProgress(44).percent
    expect(early).toBeLessThan(mid)
    expect(mid).toBeLessThan(late)
    expect(late).toBeLessThan(88)
  })

  it('creeps toward 95 during waiting and never reaches it', () => {
    const at45 = computeEstimatedGenerationProgress(45).percent
    const at85 = computeEstimatedGenerationProgress(85).percent
    // 500s (well past the tau=40s asymptote) rather than an astronomically
    // large value — e^x underflows to exactly 0 past ~-745, which would
    // make the curve hit precisely 95 and falsely fail "never reaches it".
    const atLarge = computeEstimatedGenerationProgress(500).percent
    expect(at45).toBeCloseTo(88, 1)
    expect(at85).toBeGreaterThan(at45)
    expect(at85).toBeLessThan(95)
    expect(atLarge).toBeLessThan(95)
    expect(atLarge).toBeGreaterThan(94.9)
  })

  it('reduced motion snaps to discrete stage-end values', () => {
    expect(computeEstimatedGenerationProgress(0, true).percent).toBe(20)
    expect(computeEstimatedGenerationProgress(3, true).percent).toBe(45)
    expect(computeEstimatedGenerationProgress(10, true).percent).toBe(88)
    expect(computeEstimatedGenerationProgress(999, true).percent).toBe(95)
  })
})

describe('resolveGenerationProgress', () => {
  it('prefers realProgress over the estimate', () => {
    const { percent } = resolveGenerationProgress({
      elapsedSeconds: 1,
      realProgress: 63,
    })
    expect(percent).toBe(63)
  })

  it('clamps realProgress into [0, 100]', () => {
    expect(
      resolveGenerationProgress({ elapsedSeconds: 1, realProgress: 140 })
        .percent,
    ).toBe(100)
    expect(
      resolveGenerationProgress({ elapsedSeconds: 1, realProgress: -10 })
        .percent,
    ).toBe(0)
  })

  it('isComplete always wins and jumps to 100', () => {
    expect(
      resolveGenerationProgress({
        elapsedSeconds: 3,
        realProgress: 40,
        isComplete: true,
      }).percent,
    ).toBe(100)
  })

  it('falls back to the estimate when no realProgress is given', () => {
    const { percent, stageKey } = resolveGenerationProgress({
      elapsedSeconds: 3,
    })
    expect(stageKey).toBe('connecting')
    expect(percent).toBeGreaterThan(20)
    expect(percent).toBeLessThan(45)
  })
})
