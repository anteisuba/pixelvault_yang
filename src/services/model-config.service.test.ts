import { describe, it, expect, vi } from 'vitest'

const mockFindMany = vi.fn()
const mockFindUnique = vi.fn()
const mockUpdateMany = vi.fn()

vi.mock('@/lib/db', () => ({
  db: {
    modelConfig: {
      findMany: (...a: unknown[]) => mockFindMany(...a),
      findUnique: (...a: unknown[]) => mockFindUnique(...a),
      updateMany: (...a: unknown[]) => mockUpdateMany(...a),
    },
  },
}))

import {
  getAllModelConfigs,
  getModelConfigById,
  updateModelHealthStatus,
} from '@/services/model-config.service'

const FAKE_ROW = {
  id: 'mc_1',
  modelId: 'flux-2-pro',
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
    expect(result[0].modelId).toBe('flux-2-pro')
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
    const result = await getModelConfigById('flux-2-pro')
    expect(result?.modelId).toBe('flux-2-pro')
  })
})

describe('updateModelHealthStatus', () => {
  it('updates the health status of a model', async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 })
    await updateModelHealthStatus('flux-2-pro', 'available')
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { modelId: 'flux-2-pro' },
        data: expect.objectContaining({ healthStatus: 'available' }),
      }),
    )
  })
})
