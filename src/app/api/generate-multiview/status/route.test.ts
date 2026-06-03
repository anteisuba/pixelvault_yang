import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  mockAuthenticated,
  mockUnauthenticated,
  mockRateLimitAllowed,
  mockRateLimitExceeded,
  createGET,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('@/services/multiview-generate.service', () => ({
  checkMultiViewGenerationStatus: vi.fn(),
}))

import { GET } from '@/app/api/generate-multiview/status/route'
import { checkMultiViewGenerationStatus } from '@/services/multiview-generate.service'

const mockCheckStatus = vi.mocked(checkMultiViewGenerationStatus)

describe('GET /api/generate-multiview/status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockRateLimitAllowed()
    mockCheckStatus.mockResolvedValue({
      batchId: 'batch-1',
      status: 'COMPLETED',
      views: [
        {
          id: 'gen-back',
          view: 'back',
          url: 'https://cdn.test/back.png',
          width: 1024,
          height: 1024,
          prompt: 'back view',
          model: 'flux-kontext-pro',
          provider: 'fal.ai',
        },
      ],
      jobs: [],
    } as never)
  })

  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()
    const res = await GET(
      createGET('/api/generate-multiview/status', {
        batchId: 'batch-1',
        jobIds: 'job-back',
      }),
    )
    expect(res.status).toBe(401)
  })

  it('returns 429 when rate limited', async () => {
    mockRateLimitExceeded()
    const res = await GET(
      createGET('/api/generate-multiview/status', {
        batchId: 'batch-1',
        jobIds: 'job-back',
      }),
    )
    expect(res.status).toBe(429)
  })

  it('returns 400 when query params are invalid', async () => {
    const res = await GET(createGET('/api/generate-multiview/status', {}))
    expect(res.status).toBe(400)
  })

  it('returns aggregated multi-view status on success', async () => {
    const res = await GET(
      createGET('/api/generate-multiview/status', {
        batchId: 'batch-1',
        jobIds: 'job-back,job-left,job-right',
      }),
    )
    const json = await parseJSON<{
      success: boolean
      data: { status: string; views: unknown[] }
    }>(res)

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data.status).toBe('COMPLETED')
    expect(json.data.views).toHaveLength(1)
    expect(mockCheckStatus).toHaveBeenCalledWith('clerk_test_user', {
      batchId: 'batch-1',
      jobIds: ['job-back', 'job-left', 'job-right'],
    })
  })
})
