import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createGET, parseJSON } from '@/test/api-helpers'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))

vi.mock('@/services/civitai-lora.service', () => ({
  resolveCivitaiModelPageUrlByVersion: vi.fn(),
}))

import { resolveCivitaiModelPageUrlByVersion } from '@/services/civitai-lora.service'

import { GET } from './route'

const mockResolveCivitaiModelPageUrlByVersion = vi.mocked(
  resolveCivitaiModelPageUrlByVersion,
)

beforeEach(() => {
  vi.clearAllMocks()
  mockResolveCivitaiModelPageUrlByVersion.mockResolvedValue(
    'https://civitai.com/models/2508748?modelVersionId=2819970',
  )
})

describe('GET /api/lora-assets/civitai/source', () => {
  it('redirects a model version id to the concrete Civitai model page', async () => {
    const response = await GET(
      createGET('/api/lora-assets/civitai/source', {
        modelVersionId: '2819970',
      }),
    )

    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe(
      'https://civitai.com/models/2508748?modelVersionId=2819970',
    )
    expect(mockResolveCivitaiModelPageUrlByVersion).toHaveBeenCalledWith(
      2819970,
    )
  })

  it('rejects invalid model version ids', async () => {
    const response = await GET(
      createGET('/api/lora-assets/civitai/source', {
        modelVersionId: 'nope',
      }),
    )
    const body = await parseJSON<{ success: boolean }>(response)

    expect(response.status).toBe(400)
    expect(body.success).toBe(false)
    expect(mockResolveCivitaiModelPageUrlByVersion).not.toHaveBeenCalled()
  })

  it('returns 404 when Civitai does not expose an owning model id', async () => {
    mockResolveCivitaiModelPageUrlByVersion.mockResolvedValueOnce(null)

    const response = await GET(
      createGET('/api/lora-assets/civitai/source', {
        modelVersionId: '2819970',
      }),
    )
    const body = await parseJSON<{ success: boolean }>(response)

    expect(response.status).toBe(404)
    expect(body.success).toBe(false)
  })
})
