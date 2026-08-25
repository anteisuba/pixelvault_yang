import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { CRON_JOBS } from '@/constants/cron'

const mockSweep = vi.fn()
const mockProcessPreviewOutboxes = vi.fn()
const mockRecordCronRun = vi.fn()

vi.mock('@/lib/cron-heartbeat', () => ({
  recordCronRun: (...args: unknown[]) => mockRecordCronRun(...args),
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/services/execution-sweeper.service', () => ({
  sweepStaleExecutions: (...args: unknown[]) => mockSweep(...args),
}))

vi.mock('@/services/image/image-preview-derivative.service', () => ({
  processPendingImagePreviewDerivativeOutboxes: (...args: unknown[]) =>
    mockProcessPreviewOutboxes(...args),
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
    mockProcessPreviewOutboxes.mockResolvedValue([])
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
    mockProcessPreviewOutboxes.mockResolvedValue([
      { outboxId: 'preview-1', status: 'completed' },
      { outboxId: 'preview-2', status: 'failed' },
    ])

    const res = await GET(buildRequest('Bearer test-secret'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      success: true,
      data: {
        staleJobsReaped: 2,
        expiredOutboxesReaped: 1,
        previewDerivativeOutboxesAttempted: 2,
        previewDerivativeOutboxesCompleted: 1,
      },
    })
    expect(mockSweep).toHaveBeenCalledOnce()
    expect(mockProcessPreviewOutboxes).toHaveBeenCalledWith({ limit: 5 })
    expect(mockRecordCronRun).toHaveBeenCalledWith(CRON_JOBS.EXECUTION_SWEEP, {
      ok: true,
    })
  })

  it('returns 500 when the sweep throws', async () => {
    mockSweep.mockRejectedValue(new Error('db down'))

    const res = await GET(buildRequest('Bearer test-secret'))

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.success).toBe(false)
  })

  it('records the failure heartbeat so the outage outlives the 1h log window', async () => {
    mockSweep.mockRejectedValue(new Error('db down'))

    await GET(buildRequest('Bearer test-secret'))

    expect(mockRecordCronRun).toHaveBeenCalledWith(CRON_JOBS.EXECUTION_SWEEP, {
      ok: false,
      detail: 'db down',
    })
  })

  it('does not record a heartbeat when the request never authenticated', async () => {
    // 401/503 是「有人拿错 token 敲门」，不是这条 cron 的运行结果。记进去会把
    // 一次外部探测伪装成一次成功/失败的运行。
    await GET(buildRequest('Bearer wrong'))

    expect(mockRecordCronRun).not.toHaveBeenCalled()
  })
})
