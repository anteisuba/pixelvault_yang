import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockSweep = vi.fn()

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/services/execution-sweeper.service', () => ({
  sweepStaleExecutions: (...args: unknown[]) => mockSweep(...args),
}))

import { GET } from './route'

function buildRequest(authHeader?: string): Request {
  return new Request('https://app.test/api/internal/execution/sweep', {
    headers: authHeader ? { authorization: authHeader } : {},
  })
}

describe('GET /api/internal/execution/sweep', () => {
  const originalSecret = process.env.CRON_SECRET

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = 'test-secret'
    mockSweep.mockResolvedValue({
      staleJobsReaped: 0,
      expiredOutboxesReaped: 0,
    })
  })

  afterEach(() => {
    process.env.CRON_SECRET = originalSecret
  })

  it('returns 503 when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET
    const res = await GET(buildRequest('Bearer test-secret'))
    expect(res.status).toBe(503)
    expect(mockSweep).not.toHaveBeenCalled()
  })

  it('returns 401 for a missing or wrong token', async () => {
    const res = await GET(buildRequest('Bearer wrong'))
    expect(res.status).toBe(401)
    expect(mockSweep).not.toHaveBeenCalled()
  })

  it('runs the sweep and returns its result for a valid token', async () => {
    mockSweep.mockResolvedValue({
      staleJobsReaped: 2,
      expiredOutboxesReaped: 1,
    })

    const res = await GET(buildRequest('Bearer test-secret'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      success: true,
      data: { staleJobsReaped: 2, expiredOutboxesReaped: 1 },
    })
    expect(mockSweep).toHaveBeenCalledOnce()
  })

  it('returns 500 when the sweep throws', async () => {
    mockSweep.mockRejectedValue(new Error('db down'))

    const res = await GET(buildRequest('Bearer test-secret'))

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.success).toBe(false)
  })
})
