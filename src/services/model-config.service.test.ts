import { describe, it, expect, vi } from 'vitest'

const mockFindMany = vi.fn()
const mockFindUnique = vi.fn()
const mockUpdateMany = vi.fn()
const mockUpdate = vi.fn()
const mockInvalidateModelsCache = vi.fn()

vi.mock('@/lib/cache-tags', () => ({
  invalidateModelsCache: () => mockInvalidateModelsCache(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    modelConfig: {
      findMany: (...a: unknown[]) => mockFindMany(...a),
      findUnique: (...a: unknown[]) => mockFindUnique(...a),
      update: (...a: unknown[]) => mockUpdate(...a),
      updateMany: (...a: unknown[]) => mockUpdateMany(...a),
    },
  },
}))

import { AI_MODELS } from '@/constants/models'
import {
  getAllModelConfigs,
  getModelConfigById,
  getResolvedModelOption,
  getResolvedModelOptions,
  updateModelConfig,
  updateModelHealthStatus,
} from '@/services/model-config.service'

const FAKE_ROW = {
  id: 'mc_1',
  modelId: 'seedream-5.0-pro',
  externalModelId: 'fal-ai/flux-pro/v1.1',
  adapterType: 'fal',
  outputType: 'IMAGE',
  cost: 1,
  available: true,
  officialUrl: null,
  timeoutMs: 120000,
  qualityTier: 'pro',
  i2vModelId: null,
  videoDefaults: null,
  providerConfig: { label: 'FAL', baseUrl: 'https://fal.run' },
  sortOrder: 0,
  healthStatus: 'available',
  lastHealthCheck: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('getAllModelConfigs', () => {
  it('returns a list of model config records', async () => {
    mockFindMany.mockResolvedValue([FAKE_ROW])
    const result = await getAllModelConfigs()
    expect(result).toHaveLength(1)
    expect(result[0].modelId).toBe('seedream-5.0-pro')
  })
})

describe('getModelConfigById', () => {
  it('returns null when model not found', async () => {
    mockFindUnique.mockResolvedValue(null)
    const result = await getModelConfigById('missing-model')
    expect(result).toBeNull()
  })

  it('returns a record when found', async () => {
    mockFindUnique.mockResolvedValue(FAKE_ROW)
    const result = await getModelConfigById('seedream-5.0-pro')
    expect(result?.modelId).toBe('seedream-5.0-pro')
  })
})

describe('getResolvedModelOptions', () => {
  it('hides legacy renamed DB rows and falls back to the canonical catalog row', async () => {
    mockFindMany.mockResolvedValue([
      { ...FAKE_ROW, modelId: 'veo-3', externalModelId: 'fal-ai/veo3' },
    ])

    const result = await getResolvedModelOptions()
    const modelIds = result.map((model) => model.id)

    expect(modelIds).toContain('veo-3.1')
    expect(modelIds).not.toContain('veo-3')
  })

  it('hides retired DB rows and keeps the inactive fallback catalog entry', async () => {
    mockFindMany.mockResolvedValue([
      {
        ...FAKE_ROW,
        modelId: AI_MODELS.ANIMA_PENCIL_XL,
        externalModelId: 'custom/anima',
        available: true,
      },
    ])

    const result = await getResolvedModelOptions()
    const animaRows = result.filter(
      (model) => model.id === AI_MODELS.ANIMA_PENCIL_XL,
    )

    expect(animaRows).toHaveLength(1)
    expect(animaRows[0]).toMatchObject({
      available: false,
      externalModelId: 'lucataco/animapencil-xl-v4',
    })
  })
})

describe('getResolvedModelOption', () => {
  it('keeps paused PixAI entries unavailable even when old DB rows enable them', async () => {
    const row = {
      ...FAKE_ROW,
      modelId: AI_MODELS.PIXAI_TSUBAKI_2,
      adapterType: 'pixai',
      available: true,
    }
    mockFindMany.mockResolvedValue([row])
    mockFindUnique.mockResolvedValue(row)
    mockFindUnique.mockClear()
    const resolved = await getResolvedModelOption(AI_MODELS.PIXAI_TSUBAKI_2)
    expect(resolved?.available).toBe(false)
    expect(mockFindUnique).not.toHaveBeenCalled()
    const catalog = await getResolvedModelOptions()
    expect(
      catalog.find((model) => model.id === AI_MODELS.PIXAI_TSUBAKI_2)
        ?.available,
    ).toBe(false)
  })

  it('applies DB execution overrides to the canonical built-in model', async () => {
    mockFindUnique.mockResolvedValue({
      ...FAKE_ROW,
      modelId: 'seedream-5.0-pro',
      externalModelId: 'fal-ai/flux-pro/new-version',
      adapterType: 'replicate',
      cost: 7,
      available: false,
      providerConfig: {
        label: 'Replicate',
        baseUrl: 'https://api.replicate.com',
      },
    })

    const result = await getResolvedModelOption('seedream-5.0-pro')

    expect(result).toMatchObject({
      id: 'seedream-5.0-pro',
      externalModelId: 'fal-ai/flux-pro/new-version',
      adapterType: 'replicate',
      cost: 7,
      available: false,
      providerConfig: {
        label: 'Replicate',
        baseUrl: 'https://api.replicate.com',
      },
    })
  })
})

describe('model catalog mutation cache invalidation', () => {
  it('invalidates the public catalog after a model update', async () => {
    mockUpdate.mockResolvedValue({ ...FAKE_ROW, available: false })

    await updateModelConfig('seedream-5.0-pro', { available: false })

    expect(mockInvalidateModelsCache).toHaveBeenCalledOnce()
  })
})

describe('updateModelHealthStatus', () => {
  it('updates the health status of a model', async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 })
    await updateModelHealthStatus('seedream-5.0-pro', 'available')
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { modelId: 'seedream-5.0-pro' },
        data: expect.objectContaining({ healthStatus: 'available' }),
      }),
    )
  })
})
