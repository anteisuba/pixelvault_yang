import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { parseJSON } from '@/test/api-helpers'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

vi.mock('@/services/civitai-lora.service', () => ({
  prewarmCivitaiLoraLibrary: vi.fn(),
}))

import { prewarmCivitaiLoraLibrary } from '@/services/civitai-lora.service'

import { GET } from './route'

const mockPrewarmCivitaiLoraLibrary = vi.mocked(prewarmCivitaiLoraLibrary)
const previousCronSecret = process.env.CRON_SECRET
const CRON_SECRET = 'test-cron-secret'

function createRequest(token?: string): Request {
  return new Request(
    'http://localhost:3000/api/internal/civitai-lora/prewarm',
    {
      method: 'GET',
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
    },
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = CRON_SECRET
  mockPrewarmCivitaiLoraLibrary.mockResolvedValue({
    checkedAt: '2026-05-23T00:00:00.000Z',
    total: 1,
    successCount: 1,
    failureCount: 0,
    entries: [
      {
        baseModel: 'all',
        sort: 'Newest',
        ok: true,
        itemCount: 10,
        hasNextPage: true,
        nextCursor: 'cursor-next',
        durationMs: 20,
      },
    ],
  })
})

afterEach(() => {
  if (previousCronSecret === undefined) {
    delete process.env.CRON_SECRET
  } else {
    process.env.CRON_SECRET = previousCronSecret
  }
})

describe('GET /api/internal/civitai-lora/prewarm', () => {
  it('returns 503 when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET

    const response = await GET(createRequest(CRON_SECRET))
    const body = await parseJSON<{ success: boolean; error: string }>(response)

    expect(response.status).toBe(503)
    expect(body.success).toBe(false)
    expect(mockPrewarmCivitaiLoraLibrary).not.toHaveBeenCalled()
  })

  it('returns 401 when bearer token is missing or invalid', async () => {
    const response = await GET(createRequest('wrong-secret'))
    const body = await parseJSON<{ success: boolean; error: string }>(response)

    expect(response.status).toBe(401)
    expect(body.success).toBe(false)
    expect(mockPrewarmCivitaiLoraLibrary).not.toHaveBeenCalled()
  })

  it('runs the Civitai LoRA prewarm job for authorized cron requests', async () => {
    const response = await GET(createRequest(CRON_SECRET))
    const body = await parseJSON<{
      success: boolean
      data: { successCount: number; failureCount: number }
    }>(response)

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toMatchObject({
      successCount: 1,
      failureCount: 0,
    })
    expect(mockPrewarmCivitaiLoraLibrary).toHaveBeenCalledOnce()
  })

  it('returns 502 when every prewarm task fails', async () => {
    mockPrewarmCivitaiLoraLibrary.mockResolvedValueOnce({
      checkedAt: '2026-05-23T00:00:00.000Z',
      total: 1,
      successCount: 0,
      failureCount: 1,
      entries: [
        {
          baseModel: 'Illustrious',
          sort: 'Newest',
          ok: false,
          itemCount: 0,
          hasNextPage: false,
          nextCursor: null,
          durationMs: 20,
          error: 'Civitai unavailable',
        },
      ],
    })

    const response = await GET(createRequest(CRON_SECRET))
    const body = await parseJSON<{ success: boolean; error: string }>(response)

    expect(response.status).toBe(502)
    expect(body.success).toBe(false)
    expect(body.error).toBe('Civitai LoRA prewarm failed')
  })
})
