import { describe, expect, it } from 'vitest'

import { AI_MODELS } from '@/constants/models'
import { estimateGenerationCost } from '@/lib/generation-cost'

// GIF（owner 2026-11-05 gif-output mockup ①「按实际用量，出图前估不出」）：
// 官方没给 GIF 单价，⛔ 不拿单张 PNG 的价顶上。
describe('estimateGenerationCost · GIF', () => {
  const basis = {
    kind: 'image' as const,
    perModelCount: 1,
    aspectRatio: '1:1',
    quality: 'low',
  }

  it('prices a GPT Image 2.6 PNG but reports a GIF as unpriced', () => {
    const models = [{ modelId: AI_MODELS.OPENAI_GPT_IMAGE_26_FLARE }]
    const png = estimateGenerationCost(models, basis)
    expect(png.unpricedCount).toBe(0)
    expect(png.total).toBeGreaterThan(0)

    const gif = estimateGenerationCost(models, {
      ...basis,
      outputFormat: 'gif',
    })
    expect(gif.total).toBe(0)
    expect(gif.pricedCount).toBe(0)
    expect(gif.unpricedCount).toBe(1)
    expect(gif.rangeBounds).toBeNull()
  })

  it('keeps pricing a model that cannot make a GIF (it gets PNG)', () => {
    const models = [{ modelId: AI_MODELS.OPENAI_GPT_IMAGE_2 }]
    const gif = estimateGenerationCost(models, {
      ...basis,
      outputFormat: 'gif',
    })
    expect(gif.unpricedCount).toBe(0)
    expect(gif.pricedCount).toBe(1)
  })
})
