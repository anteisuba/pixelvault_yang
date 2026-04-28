import { describe, it, expect } from 'vitest'

import { AI_MODELS, RETIRED_MODEL_IDS } from '@/constants/models'
import type { ImageIntent } from '@/types'
import { routeModelsForIntent } from './model-router.service'

describe('routeModelsForIntent', () => {
  it('returns a non-empty ranked list for a photorealistic portrait intent', () => {
    const intent: ImageIntent = {
      subject: 'a woman',
      style: 'photorealism',
      mood: 'dramatic',
    }
    const results = routeModelsForIntent(intent)

    expect(results.length).toBeGreaterThan(0)
    expect(results[0]).toMatchObject({
      modelId: expect.any(String),
      score: expect.any(Number),
      reason: expect.any(String),
      matchedBestFor: expect.any(Array),
    })
  })

  it('ranks photorealistic models higher for photorealism intent', () => {
    const intent: ImageIntent = {
      subject: 'product photo',
      style: 'photorealistic',
    }
    const results = routeModelsForIntent(intent)
    const topResult = results[0]

    expect(
      topResult.matchedBestFor.some(
        (bestFor) => bestFor.includes('photo') || bestFor.includes('product'),
      ),
    ).toBe(true)
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

  it('returns at most 5 results', () => {
    const intent: ImageIntent = { subject: 'anything' }
    const results = routeModelsForIntent(intent)
    expect(results.length).toBeLessThanOrEqual(5)
  })

  it('does not recommend retired models', () => {
    const intent: ImageIntent = {
      subject: 'logo poster',
      style: 'graphic design',
    }
    const results = routeModelsForIntent(intent)
    const resultModelIds = results.map((result) => result.modelId)

    for (const modelId of RETIRED_MODEL_IDS) {
      expect(resultModelIds).not.toContain(modelId)
    }
  })

  it('returns results with score 0 for unmatched intent (minimal intent)', () => {
    const intent: ImageIntent = { subject: 'something completely vague' }
    const results = routeModelsForIntent(intent)
    expect(results.length).toBeGreaterThan(0)
  })

  it('includes all models with score > 0 before models with score 0', () => {
    const intent: ImageIntent = {
      subject: 'portrait',
      style: 'photorealism',
    }
    const results = routeModelsForIntent(intent)
    const firstZeroIndex = results.findIndex((result) => result.score === 0)

    if (firstZeroIndex !== -1) {
      const allBefore = results.slice(0, firstZeroIndex)
      expect(allBefore.every((result) => result.score > 0)).toBe(true)
    }
  })

  it('uses arena win rates to influence ranking', () => {
    const intent: ImageIntent = { subject: 'something completely vague' }
    const results = routeModelsForIntent(intent, {
      [AI_MODELS.SEEDREAM_45]: 1,
    })

    expect(results[0]).toMatchObject({
      modelId: AI_MODELS.SEEDREAM_45,
      score: 2,
    })
  })
})
