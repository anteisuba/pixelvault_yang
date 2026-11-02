import { describe, expect, it } from 'vitest'

import { CREDIT_LIMITS } from '@/constants/credits'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  ceilUsdToPoints,
  estimateCanvasNodePoints,
  estimateGenerationPoints,
  pointsOfCost,
} from '@/lib/credits/estimate-points'
import { estimateGenerationCost } from '@/lib/credits/generation-cost'
import type { CanvasNodeGenerationState } from '@/lib/studio-operator-canvas-snapshot'

describe('事先估点（平台点数第 2 片后半）', () => {
  it('USD → 整点向上取整，不被浮点误差多算一点', () => {
    expect(ceilUsdToPoints(0.04)).toBe(4)
    expect(ceilUsdToPoints(0.12)).toBe(12)
    expect(ceilUsdToPoints(0.031)).toBe(4)
    expect(ceilUsdToPoints(0)).toBe(0)
  })

  it('有缺价的模型 → 估不出（⛔ 不当 0）', () => {
    const estimate = estimateGenerationCost(
      [{ modelId: 'flux-2-pro' }, { modelId: 'seedream-4' }],
      { kind: 'image', perModelCount: 1 },
    )
    expect(pointsOfCost(estimate, 2)).toBeNull()
  })

  it('标了价的按张算：flux-2-pro $0.03 × 4 = 12 点', () => {
    expect(
      estimateGenerationPoints([{ modelId: 'flux-2-pro' }], {
        kind: 'image',
        perModelCount: 4,
      }),
    ).toBe(12)
  })

  it('NAI 订阅不另花钱 = 0 点', () => {
    expect(
      estimateGenerationPoints([{ modelId: 'nai-diffusion-4-5-full' }], {
        kind: 'image',
        perModelCount: 4,
      }),
    ).toBe(0)
  })

  it('平台 Runner 花的是平台点数：每张按上沿估，⛔ 不再当免费', () => {
    expect(
      estimateGenerationPoints(
        [
          { modelId: 'any-runner', adapterType: AI_ADAPTER_TYPES.RUNNER },
          { modelId: 'flux-2-pro' },
        ],
        { kind: 'image', perModelCount: 2 },
      ),
    ).toBe(2 * CREDIT_LIMITS.runnerEstimatePointsPerImage + 6)
  })

  it('一个模型都没选 → 估不出', () => {
    expect(
      estimateGenerationPoints([], { kind: 'image', perModelCount: 1 }),
    ).toBeNull()
  })

  it('画布卡：没选模型估不出；有价的按 USD 向上取整', () => {
    const base = {
      kind: NODE_MEDIA_KIND_IDS.image,
      parameters: { values: {} },
    } as unknown as CanvasNodeGenerationState
    expect(estimateCanvasNodePoints({ ...base, model: undefined })).toBeNull()
    expect(
      estimateCanvasNodePoints({ ...base, model: 'nai-diffusion-4-5-full' }),
    ).toBe(0)
    expect(estimateCanvasNodePoints({ ...base, model: 'flux-2-pro' })).toBe(3)
  })
})
