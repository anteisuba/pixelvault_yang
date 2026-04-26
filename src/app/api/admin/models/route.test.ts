import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  mockAuthenticated,
  mockUnauthenticated,
  createPOST,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('@/lib/admin', () => ({
  isAdmin: vi.fn(),
}))

vi.mock('@/services/model-config.service', () => ({
  getAllModelConfigs: vi.fn(),
  createModelConfig: vi.fn(),
}))

import { GET, POST } from './route'
import { isAdmin } from '@/lib/admin'
import {
  getAllModelConfigs,
  createModelConfig,
} from '@/services/model-config.service'

const mockIsAdmin = vi.mocked(isAdmin)
const mockGetAllModelConfigs = vi.mocked(getAllModelConfigs)
const mockCreateModelConfig = vi.mocked(createModelConfig)

const CREATED_AT = new Date('2026-01-01T00:00:00.000Z')

const FAKE_MODEL_CONFIG = {
  id: 'cfg_1',
  modelId: 'sdxl',
  externalModelId: 'stabilityai/stable-diffusion-xl-base-1.0',
  adapterType: 'huggingface',
  outputType: 'IMAGE' as const,
  cost: 1,
  available: true,
  officialUrl: null,
  timeoutMs: null,
  qualityTier: 'standard',
  i2vModelId: null,
  videoDefaults: null,
  providerConfig: {
    label: 'HuggingFace',
    baseUrl: 'https://api-inference.huggingface.co',
  },
  sortOrder: 0,
  healthStatus: null,
  lastHealthCheck: null,
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
}

const VALID_MODEL_BODY = {
  modelId: 'sdxl',
  externalModelId: 'stabilityai/stable-diffusion-xl-base-1.0',
  adapterType: 'huggingface',
  outputType: 'IMAGE',
  cost: 1,
  available: true,
  providerConfig: {
    label: 'HuggingFace',
    baseUrl: 'https://api-inference.huggingface.co',
  },
  sortOrder: 0,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuthenticated()
  mockIsAdmin.mockReturnValue(true)
  mockGetAllModelConfigs.mockResolvedValue([FAKE_MODEL_CONFIG] as never)
  mockCreateModelConfig.mockResolvedValue(FAKE_MODEL_CONFIG as never)
})

describe('GET /api/admin/models', () => {
  it('returns 403 when unauthenticated', async () => {
    mockUnauthenticated()

    const res = await GET()
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(403)
    expect(body.success).toBe(false)
    expect(mockGetAllModelConfigs).not.toHaveBeenCalled()
  })

  it('returns 403 for non-admin users', async () => {
    mockIsAdmin.mockReturnValue(false)

    const res = await GET()
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(403)
    expect(body.success).toBe(false)
    expect(mockGetAllModelConfigs).not.toHaveBeenCalled()
  })

  it('returns model configs for admins', async () => {
    const res = await GET()
    const body = await parseJSON<{ success: boolean; data: unknown[] }>(res)

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toHaveLength(1)
    expect(mockGetAllModelConfigs).toHaveBeenCalledTimes(1)
  })
})

describe('POST /api/admin/models', () => {
  it('returns 400 for invalid model config body', async () => {
    const res = await POST(
      createPOST('/api/admin/models', { modelId: 'missing-required-fields' }),
    )
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(mockCreateModelConfig).not.toHaveBeenCalled()
  })

  it('creates a model config for admins', async () => {
    const res = await POST(createPOST('/api/admin/models', VALID_MODEL_BODY))
    const body = await parseJSON<{ success: boolean; data: unknown }>(res)

    expect(res.status).toBe(201)
    expect(body.success).toBe(true)
    expect(body.data).toMatchObject({ modelId: 'sdxl' })
    expect(mockCreateModelConfig).toHaveBeenCalledWith(VALID_MODEL_BODY)
  })
})
