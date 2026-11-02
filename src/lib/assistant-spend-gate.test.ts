import { describe, expect, it } from 'vitest'

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  isFreeGenerationModel,
  pointsOfCost,
  spendDecision,
  sumPoints,
  usdToPoints,
} from '@/lib/assistant-spend-gate'
import { estimateGenerationCost } from '@/lib/generation-cost'

describe('助手钱闸', () => {
  it('USD → 点向上取整，不被浮点误差多算一点', () => {
    expect(usdToPoints(0.04)).toBe(4)
    expect(usdToPoints(0.12)).toBe(12)
    expect(usdToPoints(0.031)).toBe(4)
    expect(usdToPoints(0)).toBe(0)
  })

  it('NAI 与平台 Runner 不另花钱', () => {
    expect(isFreeGenerationModel('nai-diffusion-4-5-full')).toBe(true)
    expect(isFreeGenerationModel('x', AI_ADAPTER_TYPES.RUNNER)).toBe(true)
    expect(isFreeGenerationModel('flux-2-pro')).toBe(false)
  })

  it('有缺价的模型 → 估不出（⛔ 不当 0）', () => {
    const estimate = estimateGenerationCost(
      [{ modelId: 'flux-2-pro' }, { modelId: 'seedream-4' }],
      { kind: 'image', perModelCount: 1 },
    )
    expect(pointsOfCost(estimate, 2)).toBeNull()
  })

  it('标了价的按张算：flux-2-pro $0.03 × 4 = 12 点', () => {
    const estimate = estimateGenerationCost([{ modelId: 'flux-2-pro' }], {
      kind: 'image',
      perModelCount: 4,
    })
    expect(pointsOfCost(estimate, 1)).toBe(12)
  })

  it('没有要花钱的模型 = 0 点', () => {
    expect(
      pointsOfCost(
        estimateGenerationCost([], { kind: 'image', perModelCount: 4 }),
        0,
      ),
    ).toBe(0)
  })

  it('任意一份估不出，整批就估不出', () => {
    expect(sumPoints([3, 4])).toBe(7)
    expect(sumPoints([3, null])).toBeNull()
  })

  it('累计到门槛（含）直接出；超了或估不出先问', () => {
    expect(spendDecision(40, 60, 100)).toEqual({ kind: 'go', points: 40 })
    expect(spendDecision(41, 60, 100)).toEqual({ kind: 'ask', points: 41 })
    expect(spendDecision(null, 0, 100)).toEqual({ kind: 'ask', points: null })
    expect(spendDecision(5, 0, 0)).toEqual({ kind: 'ask', points: 5 })
    expect(spendDecision(0, 0, 0)).toEqual({ kind: 'go', points: 0 })
  })
})
