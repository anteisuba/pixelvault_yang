import { describe, it, expect, vi, beforeEach } from 'vitest'

import { EXECUTION_SWEEPER } from '@/constants/execution'

const mockJobUpdateMany = vi.fn()
const mockOutboxUpdateMany = vi.fn()
const mockLoggerWarn = vi.fn()

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: (...args: unknown[]) => mockLoggerWarn(...args),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('@/lib/db', () => ({
  db: {
    generationJob: {
      updateMany: (...args: unknown[]) => mockJobUpdateMany(...args),
    },
    executionOutbox: {
      updateMany: (...args: unknown[]) => mockOutboxUpdateMany(...args),
    },
  },
}))

import {
  reconcileStaleGenerationJob,
  sweepStaleExecutions,
} from './execution-sweeper.service'

type UpdateManyArg = {
  where: {
    status: string
    startedAt?: { lt: Date }
    leaseExpiresAt?: { lt: Date }
  }
  data: { status: string }
}

describe('execution-sweeper.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockJobUpdateMany.mockResolvedValue({ count: 0 })
    mockOutboxUpdateMany.mockResolvedValue({ count: 0 })
  })

  it('reaps stale RUNNING jobs via a status CAS and a now-threshold cutoff', async () => {
    mockJobUpdateMany.mockResolvedValue({ count: 3 })

    const before = Date.now()
    const result = await sweepStaleExecutions()
    const after = Date.now()

    expect(result.staleJobsReaped).toBe(3)
    expect(mockJobUpdateMany).toHaveBeenCalledOnce()

    const arg = mockJobUpdateMany.mock.calls[0]?.[0] as UpdateManyArg
    // CAS: only RUNNING rows reaped, so a late RUNNING→COMPLETED callback wins.
    expect(arg.where.status).toBe('RUNNING')
    expect(arg.data.status).toBe('FAILED')

    // Cutoff is exactly now - STALE_JOB_THRESHOLD_MS (within the call window).
    const cutoff = arg.where.startedAt?.lt.getTime() ?? 0
    expect(cutoff).toBeGreaterThanOrEqual(
      before - EXECUTION_SWEEPER.STALE_JOB_THRESHOLD_MS,
    )
    expect(cutoff).toBeLessThanOrEqual(
      after - EXECUTION_SWEEPER.STALE_JOB_THRESHOLD_MS,
    )
  })

  it('reaps expired PROCESSING outboxes via a lease CAS', async () => {
    mockOutboxUpdateMany
      .mockResolvedValueOnce({ count: 2 })
      .mockResolvedValueOnce({ count: 1 })

    const result = await sweepStaleExecutions()

    expect(result.expiredOutboxesReaped).toBe(3)
    const arg = mockOutboxUpdateMany.mock.calls[0]?.[0] as UpdateManyArg
    expect(arg.where.status).toBe('PROCESSING')
    expect(arg.where.leaseExpiresAt?.lt).toBeInstanceOf(Date)
    expect(arg.data.status).toBe('PENDING')

    const destructiveArg = mockOutboxUpdateMany.mock
      .calls[1]?.[0] as UpdateManyArg
    expect(destructiveArg.data.status).toBe('FAILED')
  })

  it('stays silent when nothing is orphaned', async () => {
    const result = await sweepStaleExecutions()

    expect(result).toEqual({ staleJobsReaped: 0, expiredOutboxesReaped: 0 })
    expect(mockLoggerWarn).not.toHaveBeenCalled()
  })

  it('logs a warning when orphans are reaped', async () => {
    mockJobUpdateMany.mockResolvedValue({ count: 1 })

    await sweepStaleExecutions()

    expect(mockLoggerWarn).toHaveBeenCalledOnce()
  })

  it('lazily reaps one stale job during an authenticated status poll', async () => {
    mockJobUpdateMany.mockResolvedValue({ count: 1 })
    const now = new Date('2026-07-23T12:00:00.000Z')

    const reaped = await reconcileStaleGenerationJob(
      {
        id: 'job-stale',
        status: 'RUNNING',
        startedAt: new Date(
          now.getTime() - EXECUTION_SWEEPER.STALE_JOB_THRESHOLD_MS - 1,
        ),
      },
      now,
    )

    expect(reaped).toBe(true)
    expect(mockJobUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'job-stale', status: 'RUNNING' }),
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    )
  })

  it('does not write for a fresh or terminal job during status polling', async () => {
    const now = new Date('2026-07-23T12:00:00.000Z')

    await expect(
      reconcileStaleGenerationJob(
        { id: 'job-fresh', status: 'RUNNING', startedAt: now },
        now,
      ),
    ).resolves.toBe(false)
    await expect(
      reconcileStaleGenerationJob(
        { id: 'job-done', status: 'COMPLETED', startedAt: null },
        now,
      ),
    ).resolves.toBe(false)
    expect(mockJobUpdateMany).not.toHaveBeenCalled()
  })
})
