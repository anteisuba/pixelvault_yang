import { describe, it, expect, vi, beforeEach } from 'vitest'

import { parseJSON } from '@/test/api-helpers'

vi.mock('@/services/model-config.service', () => ({
  getResolvedModelOptions: vi.fn(),
}))

import { GET } from './route'
import { getResolvedModelOptions } from '@/services/model-config.service'

const mockGetResolvedModelOptions = vi.mocked(getResolvedModelOptions)

const AVAILABLE_MODEL = {
  id: 'sdxl',
  cost: 1,
  adapterType: 'huggingface',
  providerConfig: { label: 'HuggingFace', baseUrl: 'https://example.com' },
  externalModelId: 'stabilityai/stable-diffusion-xl-base-1.0',
  outputType: 'IMAGE',
  available: true,
}

const UNAVAILABLE_MODEL = {
  ...AVAILABLE_MODEL,
  id: 'disabled-model',
  available: false,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/models', () => {
  it('returns only available public models', async () => {
    mockGetResolvedModelOptions.mockResolvedValue([
      AVAILABLE_MODEL,
      UNAVAILABLE_MODEL,
    ] as never)

    const res = await GET()
    const body = await parseJSON<{ success: boolean; data: unknown[] }>(res)

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toHaveLength(1)
    expect(body.data[0]).toMatchObject({ id: 'sdxl', available: true })
  })

  it('returns an empty list when no models are available', async () => {
    mockGetResolvedModelOptions.mockResolvedValue([UNAVAILABLE_MODEL] as never)

    const res = await GET()
    const body = await parseJSON<{ success: boolean; data: unknown[] }>(res)

    expect(res.status).toBe(200)
    expect(body).toEqual({ success: true, data: [] })
  })

  it('returns 500 when model resolution fails', async () => {
    mockGetResolvedModelOptions.mockRejectedValue(new Error('DB unavailable'))

    const res = await GET()
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(500)
    expect(body.success).toBe(false)
    expect(body.error).toBe('DB unavailable')
  })
})
