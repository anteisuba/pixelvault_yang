import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createGET,
  mockAuthenticated,
  mockRateLimitAllowed,
  mockRateLimitExceeded,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('@/services/video-pipeline.service', () => ({
  checkPipelineStatus: vi.fn(),
}))

import { GET } from './route'
import { checkPipelineStatus } from '@/services/video-pipeline.service'

const mockCheck = vi.mocked(checkPipelineStatus)

const FAKE_STATUS = {
  pipelineId: 'pipeline-123',
  status: 'RUNNING' as const,
  totalClips: 3,
  completedClips: 1,
  currentDurationSec: 10,
  targetDurationSec: 30,
  clips: [],
}

describe('GET /api/generate-long-video/status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockRateLimitAllowed()
    mockCheck.mockResolvedValue(FAKE_STATUS as never)
  })

  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()
    const req = createGET('/api/generate-long-video/status', {
      pipelineId: 'pipeline-123',
    })
    const res = await GET(req)

    expect(res.status).toBe(401)
    const body = await parseJSON<{ success: boolean }>(res)
    expect(body.success).toBe(false)
  })

  it('returns 429 when rate limited', async () => {
    mockRateLimitExceeded()
    const req = createGET('/api/generate-long-video/status', {
      pipelineId: 'pipeline-123',
    })
    const res = await GET(req)

    expect(res.status).toBe(429)
    const body = await parseJSON<{ success: boolean; error: string }>(res)
    expect(body.success).toBe(false)
    expect(body.error).toContain('Too many requests')
  })

  it('returns 400 for missing pipelineId', async () => {
    const req = createGET('/api/generate-long-video/status')
    const res = await GET(req)

    expect(res.status).toBe(400)
    const body = await parseJSON<{ success: boolean }>(res)
    expect(body.success).toBe(false)
  })

  it('returns pipeline status data on success', async () => {
    const req = createGET('/api/generate-long-video/status', {
      pipelineId: 'pipeline-123',
    })
    const res = await GET(req)

    expect(res.status).toBe(200)
    const body = await parseJSON<{
      success: boolean
      data: typeof FAKE_STATUS
    }>(res)
    expect(body.success).toBe(true)
    expect(body.data.pipelineId).toBe('pipeline-123')
    expect(mockCheck).toHaveBeenCalledWith('clerk_test_user', 'pipeline-123')
  })

  it('returns 500 on unexpected service error', async () => {
    mockCheck.mockRejectedValue(new Error('pipeline store unavailable'))
    const req = createGET('/api/generate-long-video/status', {
      pipelineId: 'pipeline-123',
    })
    const res = await GET(req)

    expect(res.status).toBe(500)
    const body = await parseJSON<{ success: boolean }>(res)
    expect(body.success).toBe(false)
  })
})
