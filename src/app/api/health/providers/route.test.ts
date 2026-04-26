import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { parseJSON } from '@/test/api-helpers'

vi.mock('server-only', () => ({}))

vi.mock('@/services/model-config.service', () => ({
  getAllModelConfigs: vi.fn(),
}))

vi.mock('@/services/model-health.service', () => ({
  checkAllModelsHealth: vi.fn(),
}))

import { POST } from './route'
import { getAllModelConfigs } from '@/services/model-config.service'
import { checkAllModelsHealth } from '@/services/model-health.service'

const mockGetAllModelConfigs = vi.mocked(getAllModelConfigs)
const mockCheckAllModelsHealth = vi.mocked(checkAllModelsHealth)

const HEALTH_TOKEN = 'health-token'
const previousHealthToken = process.env.HEALTH_CHECK_TOKEN

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

const FAKE_HEALTH_RECORDS = [
  {
    modelId: 'sdxl',
    status: 'available' as const,
    lastChecked: new Date('2026-01-01T00:00:00.000Z'),
    latencyMs: 42,
  },
]

function createHealthRequest(token?: string) {
  return new Request('http://localhost:3000/api/health/providers', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.HEALTH_CHECK_TOKEN = HEALTH_TOKEN
  mockGetAllModelConfigs.mockResolvedValue(FAKE_MODEL_CONFIGS as never)
  mockCheckAllModelsHealth.mockResolvedValue(FAKE_HEALTH_RECORDS as never)
})

afterEach(() => {
  if (previousHealthToken === undefined) {
    delete process.env.HEALTH_CHECK_TOKEN
  } else {
    process.env.HEALTH_CHECK_TOKEN = previousHealthToken
  }
})

describe('POST /api/health/providers', () => {
  it('returns 503 when HEALTH_CHECK_TOKEN is not configured', async () => {
    delete process.env.HEALTH_CHECK_TOKEN

    const res = await POST(createHealthRequest(HEALTH_TOKEN))
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(503)
    expect(body.success).toBe(false)
    expect(mockGetAllModelConfigs).not.toHaveBeenCalled()
  })

  it('returns 401 when bearer token is missing or invalid', async () => {
    const res = await POST(createHealthRequest('wrong-token'))
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(401)
    expect(body.success).toBe(false)
    expect(mockCheckAllModelsHealth).not.toHaveBeenCalled()
  })

  it('checks available provider targets and returns a health summary', async () => {
    const res = await POST(createHealthRequest(HEALTH_TOKEN))
    const body = await parseJSON<{
      success: boolean
      data: unknown[]
      summary: {
        total: number
        available: number
        degraded: number
        unavailable: number
      }
    }>(res)

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.summary).toEqual({
      total: 1,
      available: 1,
      degraded: 0,
      unavailable: 0,
    })
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
