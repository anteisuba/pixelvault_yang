import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  mockAuthenticated,
  mockUnauthenticated,
  createGET,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('@/services/generate-video.service', () => ({
  checkVideoGenerationStatus: vi.fn(),
}))

import { GET } from './route'
import { checkVideoGenerationStatus } from '@/services/generate-video.service'

const mockCheck = vi.mocked(checkVideoGenerationStatus)

const FAKE_STATUS = {
  jobId: 'job_123',
  status: 'COMPLETED' as const,
  generation: undefined,
}

describe('GET /api/generate-video/status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockCheck.mockResolvedValue(FAKE_STATUS as never)
  })

  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()
    const req = createGET('/api/generate-video/status', { jobId: 'job_123' })
    const res = await GET(req)

    expect(res.status).toBe(401)
    const body = await parseJSON<{ success: boolean }>(res)
    expect(body.success).toBe(false)
  })

  it('returns 400 for missing jobId', async () => {
    const req = createGET('/api/generate-video/status')
    const res = await GET(req)

    expect(res.status).toBe(400)
    const body = await parseJSON<{ success: boolean }>(res)
    expect(body.success).toBe(false)
  })

  it('returns status data on success', async () => {
    const req = createGET('/api/generate-video/status', { jobId: 'job_123' })
    const res = await GET(req)

    expect(res.status).toBe(200)
    const body = await parseJSON<{
      success: boolean
      data: typeof FAKE_STATUS
    }>(res)
    expect(body.success).toBe(true)
    expect(body.data.jobId).toBe('job_123')
    expect(mockCheck).toHaveBeenCalledWith('clerk_test_user', 'job_123')
  })

  it('returns 500 on unexpected service error', async () => {
    mockCheck.mockRejectedValue(new Error('DB connection lost'))
    const req = createGET('/api/generate-video/status', { jobId: 'job_123' })
    const res = await GET(req)

    expect(res.status).toBe(500)
    const body = await parseJSON<{ success: boolean }>(res)
    expect(body.success).toBe(false)
  })
})
