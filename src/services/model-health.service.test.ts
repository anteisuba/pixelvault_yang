import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/platform-keys', () => ({
  getSystemApiKey: vi.fn().mockReturnValue('sys-api-key'),
}))

vi.mock('@/services/model-config.service', () => ({
  updateModelHealthStatus: vi.fn().mockResolvedValue({}),
}))

const mockGetProviderAdapter = vi.fn()
vi.mock('@/services/providers/registry', () => ({
  getProviderAdapter: (...a: unknown[]) => mockGetProviderAdapter(...a),
}))

import {
  getHealthCache,
  checkSingleModelHealth,
  checkAllModelsHealth,
} from '@/services/model-health.service'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

const FAKE_TARGET = {
  modelId: 'flux-2-pro',
  externalModelId: 'fal-ai/flux-pro/v1.1',
  adapterType: AI_ADAPTER_TYPES.FAL,
  baseUrl: 'https://fal.run',
}

describe('getHealthCache', () => {
  it('returns null or a cached record collection', () => {
    const result = getHealthCache()

    expect(result === null || Array.isArray(result.records)).toBe(true)
  })
})

describe('checkSingleModelHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns degraded when adapter has no healthCheck method', async () => {
    mockGetProviderAdapter.mockReturnValue({
      adapterType: AI_ADAPTER_TYPES.FAL,
    })

    const result = await checkSingleModelHealth(FAKE_TARGET)

    expect(result.status).toBe('degraded')
    expect(result.modelId).toBe('flux-2-pro')
  })

  it('calls adapter healthCheck and returns its result', async () => {
    mockGetProviderAdapter.mockReturnValue({
      adapterType: AI_ADAPTER_TYPES.FAL,
      healthCheck: vi
        .fn()
        .mockResolvedValue({ status: 'available', latencyMs: 42 }),
    })

    const result = await checkSingleModelHealth(FAKE_TARGET)

    expect(result.status).toBe('available')
    expect(result.latencyMs).toBe(42)
  })
})

describe('checkAllModelsHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('handles rejected promises and returns unavailable for failed models', async () => {
    mockGetProviderAdapter.mockReturnValue({
      adapterType: AI_ADAPTER_TYPES.FAL,
      healthCheck: vi.fn().mockRejectedValue(new Error('Timeout')),
    })

    const results = await checkAllModelsHealth([FAKE_TARGET])

    expect(results[0]?.status).toBe('unavailable')
    expect(results[0]?.error).toBe('Timeout')
  })
})
