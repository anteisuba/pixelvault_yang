import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_MODELS, RETIRED_MODEL_IDS } from '@/constants/models'
import type { ImageIntent } from '@/types'

const mockGetModelWinRatesByTask = vi.hoisted(() => vi.fn())
const mockGetUserPreference = vi.hoisted(() => vi.fn())

vi.mock('@/services/arena-winrate.service', () => ({
  getModelWinRatesByTask: (...args: unknown[]) =>
    mockGetModelWinRatesByTask(...args),
}))

vi.mock('@/services/user-preference.service', () => ({
  getUserPreference: (...args: unknown[]) => mockGetUserPreference(...args),
  parseUserPreferredModelsByTask: (value: unknown) => value ?? {},
}))

import { estimateModelCost, routeModelsForIntent } from './model-router.service'

describe('routeModelsForIntent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetModelWinRatesByTask.mockResolvedValue(new Map())
    mockGetUserPreference.mockResolvedValue(null)
  })

  it('uses taskFit to rank product/photo models for product intent', async () => {
    const intent: ImageIntent = {
      subject: 'commercial product photo of a premium watch',
      style: 'photorealistic',
    }
    const results = await routeModelsForIntent(intent)

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

  it('uses styleFit to rank anime/tag-based models for anime intent', async () => {
    const intent: ImageIntent = {
      subject: 'a magical girl character',
      style: 'anime illustration',
    }
    const results = await routeModelsForIntent(intent)

    expect(results[0].matchedBestFor).toEqual(
      expect.arrayContaining(['anime', 'illustration']),
    )
  })

  it('adds reference-fit signal when reference assets are provided', async () => {
    const intent: ImageIntent = {
      subject: 'portrait of the referenced person',
      referenceAssets: [
        { url: 'https://example.com/reference.png', role: 'identity' },
      ],
    }
    const results = await routeModelsForIntent(intent)

    expect(results[0].reason).toContain('reference-aware fit')
    expect(results[0].score).toBeGreaterThan(0)
  })

  it('uses cost preference to favor static cost-efficient models', async () => {
    const intent: ImageIntent = { subject: 'something completely vague' }
    const neutralResults = await routeModelsForIntent(intent)
    const lowCostResults = await routeModelsForIntent(intent, {
      preferLowCost: true,
    })

    expect(lowCostResults[0].score).toBeGreaterThanOrEqual(
      neutralResults[0].score,
    )
    expect(lowCostResults[0].reason).toContain('cost-efficient preference')
  })

  it('uses latency preference to favor static low-latency models', async () => {
    const intent: ImageIntent = { subject: 'quick draft image' }
    const results = await routeModelsForIntent(intent, {
      preferLowLatency: true,
    })

    expect(results[0].reason).toContain('low-latency preference')
    expect(results[0].score).toBeGreaterThan(0)
  })

  it('uses health preference without requiring Arena data', async () => {
    const intent: ImageIntent = { subject: 'general image' }
    const results = await routeModelsForIntent(intent, { requireHealthy: true })

    expect(results.length).toBeGreaterThan(0)
    expect(results[0].reason).toContain('healthy route preference')
  })

  it('returns results sorted descending by score', async () => {
    const intent: ImageIntent = {
      subject: 'landscape painting',
      style: 'oil painting',
    }
    const results = await routeModelsForIntent(intent)

    for (let index = 0; index < results.length - 1; index++) {
      expect(results[index].score).toBeGreaterThanOrEqual(
        results[index + 1].score,
      )
    }
  })

  it('returns at most 5 available non-retired image models', async () => {
    const intent: ImageIntent = { subject: 'anything' }
    const results = await routeModelsForIntent(intent)
    const resultModelIds = results.map((result) => result.modelId)

    expect(results.length).toBeLessThanOrEqual(5)
    for (const modelId of RETIRED_MODEL_IDS) {
      expect(resultModelIds).not.toContain(modelId)
    }
  })

  it('uses Round-2 Arena win-rate data to affect sorting', async () => {
    const intent: ImageIntent = { subject: 'something completely vague' }
    const baselineResults = await routeModelsForIntent(intent)
    const targetModelId = baselineResults[baselineResults.length - 1].modelId
    mockGetModelWinRatesByTask.mockResolvedValue(new Map([[targetModelId, 1]]))

    const boostedResults = await routeModelsForIntent(intent)

    expect(boostedResults[0].modelId).toBe(targetModelId)
    expect(boostedResults[0].reason).toContain('arena win-rate signal')
  })

  it('keeps Round-1 sorting when Round-2 Arena data is empty', async () => {
    const intent: ImageIntent = { subject: 'something completely vague' }
    const baselineResults = await routeModelsForIntent(intent)

    mockGetModelWinRatesByTask.mockResolvedValue(new Map())

    const results = await routeModelsForIntent(intent)

    expect(results.map((result) => result.modelId)).toEqual(
      baselineResults.map((result) => result.modelId),
    )
  })

  it('uses Round-3 user preference data to affect sorting', async () => {
    const intent: ImageIntent = { subject: 'something completely vague' }
    const baselineResults = await routeModelsForIntent(intent)
    const targetModelId = baselineResults[baselineResults.length - 1].modelId
    mockGetUserPreference.mockResolvedValue({
      preferredModelsByTask: { general: [targetModelId] },
    })

    const results = await routeModelsForIntent(intent, {}, { userId: 'user-1' })

    expect(results[0].modelId).toBe(targetModelId)
    expect(results[0].reason).toContain('user preference signal')
  })

  it('keeps Round-2 sorting when Round-3 user preference data is missing', async () => {
    const intent: ImageIntent = { subject: 'something completely vague' }
    const baselineResults = await routeModelsForIntent(intent)

    mockGetUserPreference.mockResolvedValue(null)

    const results = await routeModelsForIntent(intent, {}, { userId: 'user-1' })

    expect(results.map((result) => result.modelId)).toEqual(
      baselineResults.map((result) => result.modelId),
    )
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
