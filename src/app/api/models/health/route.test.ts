import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  mockAuthenticated,
  mockUnauthenticated,
  createGET,
  createPOST,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('@/lib/admin', () => ({
  isAdmin: vi.fn(),
}))

vi.mock('@/services/model-config.service', () => ({
  getAllModelConfigs: vi.fn(),
}))

vi.mock('@/services/model-health.service', () => ({
  checkAllModelsHealth: vi.fn(),
  getHealthCache: vi.fn(),
}))

import { GET, POST } from './route'
import { isAdmin } from '@/lib/admin'
import { getAllModelConfigs } from '@/services/model-config.service'
import {
  checkAllModelsHealth,
  getHealthCache,
} from '@/services/model-health.service'

const mockIsAdmin = vi.mocked(isAdmin)
const mockGetAllModelConfigs = vi.mocked(getAllModelConfigs)
const mockCheckAllModelsHealth = vi.mocked(checkAllModelsHealth)
const mockGetHealthCache = vi.mocked(getHealthCache)

const FAKE_HEALTH_RECORDS = [
  {
    modelId: 'sdxl',
    status: 'available' as const,
    lastChecked: new Date('2026-01-01T00:00:00.000Z'),
    latencyMs: 24,
  },
]

const FAKE_MODEL_CONFIGS = [
  {
    modelId: 'sdxl',
    externalModelId: 'stabilityai/stable-diffusion-xl-base-1.0',
    adapterType: 'huggingface',
    available: true,
    providerConfig: { baseUrl: 'https://api-inference.huggingface.co' },
  },
  {
    modelId: 'disabled-model',
    externalModelId: 'disabled/provider-model',
    adapterType: 'huggingface',
    available: false,
    providerConfig: { baseUrl: 'https://api-inference.huggingface.co' },
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  mockAuthenticated()
  mockIsAdmin.mockReturnValue(true)
  mockGetHealthCache.mockReturnValue(null)
  mockGetAllModelConfigs.mockResolvedValue(FAKE_MODEL_CONFIGS as never)
  mockCheckAllModelsHealth.mockResolvedValue(FAKE_HEALTH_RECORDS as never)
})

describe('GET /api/models/health', () => {
  it('returns cached health records when present', async () => {
    mockGetHealthCache.mockReturnValue({
      records: FAKE_HEALTH_RECORDS,
      stale: false,
    })

    const res = await GET()
    const body = await parseJSON<{ success: boolean; data: unknown[] }>(res)

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toHaveLength(1)
    expect(mockGetHealthCache).toHaveBeenCalledTimes(1)
  })

  it('returns an empty list when the cache is empty', async () => {
    const res = await GET()
    const body = await parseJSON<{ success: boolean; data: unknown[] }>(res)

    expect(res.status).toBe(200)
    expect(body).toEqual({ success: true, data: [] })
  })
})

describe('POST /api/models/health', () => {
  it('returns 403 when unauthenticated', async () => {
    mockUnauthenticated()

    const res = await POST(createPOST('/api/models/health', {}))
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(403)
    expect(body.success).toBe(false)
  })

  it('returns 400 for invalid refresh body', async () => {
    const res = await POST(createPOST('/api/models/health', { modelId: '' }))
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(mockCheckAllModelsHealth).not.toHaveBeenCalled()
  })

  it('refreshes matching available model health for admins', async () => {
    const res = await POST(
      createPOST('/api/models/health', { modelId: 'sdxl' }),
    )
    const body = await parseJSON<{ success: boolean; data: unknown[] }>(res)

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toHaveLength(1)
    expect(mockCheckAllModelsHealth).toHaveBeenCalledWith([
      {
        modelId: 'sdxl',
        externalModelId: 'stabilityai/stable-diffusion-xl-base-1.0',
        adapterType: 'huggingface',
        baseUrl: 'https://api-inference.huggingface.co',
      },
    ])
  })
})
