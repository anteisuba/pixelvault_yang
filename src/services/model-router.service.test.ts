import { describe, it, expect } from 'vitest'

import { AI_MODELS, RETIRED_MODEL_IDS } from '@/constants/models'
import type { ImageIntent } from '@/types'
import { estimateModelCost, routeModelsForIntent } from './model-router.service'

describe('routeModelsForIntent', () => {
  it('uses taskFit to rank product/photo models for product intent', () => {
    const intent: ImageIntent = {
      subject: 'commercial product photo of a premium watch',
      style: 'photorealistic',
    }
    const results = routeModelsForIntent(intent)

    expect(results.length).toBeGreaterThan(0)
    expect(results[0]).toMatchObject({
      modelId: expect.any(String),
      score: expect.any(Number),
      reason: expect.any(String),
      matchedBestFor: expect.any(Array),
    })
    expect(
      results[0].matchedBestFor.some(
        (bestFor) =>
          bestFor.includes('product') || bestFor.includes('photorealistic'),
      ),
    ).toBe(true)
  })

  it('uses styleFit to rank anime/tag-based models for anime intent', () => {
    const intent: ImageIntent = {
      subject: 'a magical girl character',
      style: 'anime illustration',
    }
    const results = routeModelsForIntent(intent)

    expect(results[0].matchedBestFor).toEqual(
      expect.arrayContaining(['anime', 'illustration']),
    )
  })

  it('adds reference-fit signal when reference assets are provided', () => {
    const intent: ImageIntent = {
      subject: 'portrait of the referenced person',
      referenceAssets: [
        { url: 'https://example.com/reference.png', role: 'identity' },
      ],
    }
    const results = routeModelsForIntent(intent)

    expect(results[0].reason).toContain('reference-aware fit')
    expect(results[0].score).toBeGreaterThan(0)
  })

  it('uses cost preference to favor static cost-efficient models', () => {
    const intent: ImageIntent = { subject: 'something completely vague' }
    const neutralResults = routeModelsForIntent(intent)
    const lowCostResults = routeModelsForIntent(intent, {
      preferLowCost: true,
    })

    expect(lowCostResults[0].score).toBeGreaterThanOrEqual(
      neutralResults[0].score,
    )
    expect(lowCostResults[0].reason).toContain('cost-efficient preference')
  })

  it('uses latency preference to favor static low-latency models', () => {
    const intent: ImageIntent = { subject: 'quick draft image' }
    const results = routeModelsForIntent(intent, { preferLowLatency: true })

    expect(results[0].reason).toContain('low-latency preference')
    expect(results[0].score).toBeGreaterThan(0)
  })

  it('uses health preference without consulting Arena data', () => {
    const intent: ImageIntent = { subject: 'general image' }
    const results = routeModelsForIntent(intent, { requireHealthy: true })

    expect(results.length).toBeGreaterThan(0)
    expect(results[0].reason).toContain('healthy route preference')
  })

  it('returns results sorted descending by score', () => {
    const intent: ImageIntent = {
      subject: 'landscape painting',
      style: 'oil painting',
    }
    const results = routeModelsForIntent(intent)

    for (let index = 0; index < results.length - 1; index++) {
      expect(results[index].score).toBeGreaterThanOrEqual(
        results[index + 1].score,
      )
    }
  })

  it('returns at most 5 available non-retired image models', () => {
    const intent: ImageIntent = { subject: 'anything' }
    const results = routeModelsForIntent(intent)
    const resultModelIds = results.map((result) => result.modelId)

    expect(results.length).toBeLessThanOrEqual(5)
    for (const modelId of RETIRED_MODEL_IDS) {
      expect(resultModelIds).not.toContain(modelId)
    }
  })
})

describe('estimateModelCost', () => {
  it('reads model cost from the central model catalog', () => {
    expect(estimateModelCost(AI_MODELS.FLUX_2_PRO)).toBe(2)
  })

  it('returns 0 for unknown model ids', () => {
    expect(estimateModelCost('missing-model')).toBe(0)
  })
})
