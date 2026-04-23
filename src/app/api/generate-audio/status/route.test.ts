import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createGET,
  mockAuthenticated,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('@/services/generate-audio.service', () => ({
  checkAudioGenerationStatus: vi.fn(),
}))

import { GET } from './route'
import { checkAudioGenerationStatus } from '@/services/generate-audio.service'

const mockCheck = vi.mocked(checkAudioGenerationStatus)

const FAKE_STATUS = {
  jobId: 'job-audio-123',
  status: 'COMPLETED' as const,
}

describe('GET /api/generate-audio/status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockCheck.mockResolvedValue(FAKE_STATUS as never)
  })

  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()
    const req = createGET('/api/generate-audio/status', {
      jobId: 'job-audio-123',
    })
    const res = await GET(req)

    expect(res.status).toBe(401)
    const body = await parseJSON<{ success: boolean }>(res)
    expect(body.success).toBe(false)
  })

  it('returns 400 for missing jobId', async () => {
    const req = createGET('/api/generate-audio/status')
    const res = await GET(req)

    expect(res.status).toBe(400)
    const body = await parseJSON<{ success: boolean }>(res)
    expect(body.success).toBe(false)
  })

  it('returns audio job status data on success', async () => {
    const req = createGET('/api/generate-audio/status', {
      jobId: 'job-audio-123',
    })
    const res = await GET(req)

    expect(res.status).toBe(200)
    const body = await parseJSON<{
      success: boolean
      data: typeof FAKE_STATUS
    }>(res)
    expect(body.success).toBe(true)
    expect(body.data.jobId).toBe('job-audio-123')
    expect(mockCheck).toHaveBeenCalledWith('clerk_test_user', 'job-audio-123')
  })

  it('returns 500 on unexpected service error', async () => {
    mockCheck.mockRejectedValue(new Error('queue unavailable'))
    const req = createGET('/api/generate-audio/status', {
      jobId: 'job-audio-123',
    })
    const res = await GET(req)

    expect(res.status).toBe(500)
    const body = await parseJSON<{ success: boolean }>(res)
    expect(body.success).toBe(false)
  })
})
