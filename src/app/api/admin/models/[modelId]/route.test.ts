import { NextRequest } from 'next/server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  mockAuthenticated,
  mockUnauthenticated,
  createGET,
  createDELETE,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('@/lib/admin', () => ({
  isAdmin: vi.fn(),
}))

vi.mock('@/services/model-config.service', () => ({
  getModelConfigById: vi.fn(),
  updateModelConfig: vi.fn(),
  deleteModelConfig: vi.fn(),
}))

import { GET, PATCH, DELETE } from './route'
import { isAdmin } from '@/lib/admin'
import {
  getModelConfigById,
  updateModelConfig,
  deleteModelConfig,
} from '@/services/model-config.service'

const mockIsAdmin = vi.mocked(isAdmin)
const mockGetModelConfigById = vi.mocked(getModelConfigById)
const mockUpdateModelConfig = vi.mocked(updateModelConfig)
const mockDeleteModelConfig = vi.mocked(deleteModelConfig)

const MODEL_ID = 'sdxl'
const routeParams = { params: Promise.resolve({ modelId: MODEL_ID }) }
const CREATED_AT = new Date('2026-01-01T00:00:00.000Z')

const FAKE_MODEL_CONFIG = {
  id: 'cfg_1',
  modelId: MODEL_ID,
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

function createPATCH(path: string, body: unknown) {
  return new NextRequest(new URL(path, 'http://localhost:3000'), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuthenticated()
  mockIsAdmin.mockReturnValue(true)
  mockGetModelConfigById.mockResolvedValue(FAKE_MODEL_CONFIG as never)
  mockUpdateModelConfig.mockResolvedValue({
    ...FAKE_MODEL_CONFIG,
    available: false,
  } as never)
  mockDeleteModelConfig.mockResolvedValue(undefined)
})

describe('GET /api/admin/models/[modelId]', () => {
  it('returns 403 when unauthenticated', async () => {
    mockUnauthenticated()

    const res = await GET(createGET(`/api/admin/models/${MODEL_ID}`), routeParams)
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(403)
    expect(body.success).toBe(false)
    expect(mockGetModelConfigById).not.toHaveBeenCalled()
  })

  it('returns 404 when model config is not found', async () => {
    mockGetModelConfigById.mockResolvedValue(null)

    const res = await GET(createGET(`/api/admin/models/${MODEL_ID}`), routeParams)
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(404)
    expect(body.success).toBe(false)
  })

  it('returns a model config for admins', async () => {
    const res = await GET(createGET(`/api/admin/models/${MODEL_ID}`), routeParams)
    const body = await parseJSON<{ success: boolean; data: unknown }>(res)

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toMatchObject({ modelId: MODEL_ID })
    expect(mockGetModelConfigById).toHaveBeenCalledWith(MODEL_ID)
  })
})

describe('PATCH /api/admin/models/[modelId]', () => {
  it('returns 400 for invalid update body', async () => {
    const res = await PATCH(
      createPATCH(`/api/admin/models/${MODEL_ID}`, { cost: -1 }),
      routeParams,
    )
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(mockUpdateModelConfig).not.toHaveBeenCalled()
  })

  it('updates a model config for admins', async () => {
    const res = await PATCH(
      createPATCH(`/api/admin/models/${MODEL_ID}`, { available: false }),
      routeParams,
    )
    const body = await parseJSON<{ success: boolean; data: unknown }>(res)

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toMatchObject({ available: false })
    expect(mockUpdateModelConfig).toHaveBeenCalledWith(
      MODEL_ID,
      expect.objectContaining({ available: false }),
    )
  })
})

describe('DELETE /api/admin/models/[modelId]', () => {
  it('deletes a model config for admins', async () => {
    const res = await DELETE(
      createDELETE(`/api/admin/models/${MODEL_ID}`),
      routeParams,
    )
    const body = await parseJSON<{ success: boolean }>(res)

    expect(res.status).toBe(200)
    expect(body).toEqual({ success: true })
    expect(mockDeleteModelConfig).toHaveBeenCalledWith(MODEL_ID)
  })
})
