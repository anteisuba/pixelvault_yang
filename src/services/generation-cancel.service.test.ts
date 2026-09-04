import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/lib/db', () => ({
  db: {
    generationJob: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}))

import { cancelGenerationJobs } from './generation-cancel.service'
import { db } from '@/lib/db'
import { ensureUser } from '@/services/user.service'
import { logger } from '@/lib/logger'

const mockFindMany = vi.mocked(db.generationJob.findMany)
const mockUpdateMany = vi.mocked(db.generationJob.updateMany)
const mockEnsureUser = vi.mocked(ensureUser)
const mockLoggerWarn = vi.mocked(logger.warn)

function job(
  id: string,
  status: string,
  provider = 'fal',
  providerJobId: string | null = null,
) {
  return { id, status, provider, providerJobId }
}

describe('cancelGenerationJobs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    vi.stubEnv('EXECUTION_WORKER_BASE_URL', 'https://worker.example.com')
    vi.stubEnv('INTERNAL_CALLBACK_SECRET', 'test-secret')
    mockEnsureUser.mockResolvedValue({ id: 'user-1' } as never)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('cancels QUEUED/RUNNING jobs and best-effort notifies the worker', async () => {
    mockFindMany
      .mockResolvedValueOnce([
        job('job-1', 'QUEUED'),
        job('job-2', 'RUNNING'),
      ] as never)
      .mockResolvedValueOnce([
        job('job-1', 'CANCELLED'),
        job('job-2', 'CANCELLED'),
      ] as never)
    mockUpdateMany.mockResolvedValue({ count: 2 })

    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await cancelGenerationJobs('clerk-1', ['job-1', 'job-2'])

    expect(result).toEqual({
      cancelled: ['job-1', 'job-2'],
      alreadyFinished: [],
      notFound: [],
    })
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['job-1', 'job-2'] },
        userId: 'user-1',
        status: { in: ['QUEUED', 'RUNNING'] },
      },
      data: { status: 'CANCELLED' },
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('partitions already-terminal jobs into alreadyFinished without touching them', async () => {
    mockFindMany.mockResolvedValueOnce([
      job('job-1', 'COMPLETED'),
      job('job-2', 'FAILED'),
      job('job-3', 'CANCELLED'),
    ] as never)

    const result = await cancelGenerationJobs('clerk-1', [
      'job-1',
      'job-2',
      'job-3',
    ])

    expect(result).toEqual({
      cancelled: [],
      alreadyFinished: ['job-1', 'job-2', 'job-3'],
      notFound: [],
    })
    expect(mockUpdateMany).not.toHaveBeenCalled()
  })

  it("buckets missing rows and other users' jobs into notFound without leaking which", async () => {
    mockFindMany.mockResolvedValueOnce([job('job-1', 'RUNNING')] as never)
    mockUpdateMany.mockResolvedValue({ count: 1 })
    mockFindMany.mockResolvedValueOnce([job('job-1', 'CANCELLED')] as never)

    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    // job-2 does not come back from findMany (belongs to another user, or
    // doesn't exist) — cancelGenerationJobs must not throw or distinguish.
    const result = await cancelGenerationJobs('clerk-1', ['job-1', 'job-2'])

    expect(result).toEqual({
      cancelled: ['job-1'],
      alreadyFinished: [],
      notFound: ['job-2'],
    })
  })

  it('CAS race: a job the callback finalized first lands in alreadyFinished, not cancelled', async () => {
    mockFindMany
      .mockResolvedValueOnce([job('job-1', 'RUNNING')] as never)
      .mockResolvedValueOnce([job('job-1', 'COMPLETED')] as never)
    mockUpdateMany.mockResolvedValue({ count: 0 })

    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await cancelGenerationJobs('clerk-1', ['job-1'])

    expect(result).toEqual({
      cancelled: [],
      alreadyFinished: ['job-1'],
      notFound: [],
    })
    // Never notified — the job was never actually cancelled by this call.
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('still returns success when the worker notify fails (best-effort)', async () => {
    mockFindMany
      .mockResolvedValueOnce([job('job-1', 'RUNNING')] as never)
      .mockResolvedValueOnce([job('job-1', 'CANCELLED')] as never)
    mockUpdateMany.mockResolvedValue({ count: 1 })

    const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    vi.stubGlobal('fetch', fetchMock)

    const result = await cancelGenerationJobs('clerk-1', ['job-1'])

    expect(result).toEqual({
      cancelled: ['job-1'],
      alreadyFinished: [],
      notFound: [],
    })
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'Execution worker cancel notify failed (best-effort)',
      expect.objectContaining({ jobId: 'job-1' }),
    )
  })

  it('handles a mixed batch: cancelled, alreadyFinished, and notFound together', async () => {
    mockFindMany
      .mockResolvedValueOnce([
        job('job-1', 'QUEUED'),
        job('job-2', 'COMPLETED'),
      ] as never)
      .mockResolvedValueOnce([job('job-1', 'CANCELLED')] as never)
    mockUpdateMany.mockResolvedValue({ count: 1 })

    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await cancelGenerationJobs('clerk-1', [
      'job-1',
      'job-2',
      'job-3',
    ])

    expect(result).toEqual({
      cancelled: ['job-1'],
      alreadyFinished: ['job-2'],
      notFound: ['job-3'],
    })
  })

  it('includes providerJobId in the worker cancel payload when the job has one', async () => {
    mockFindMany
      .mockResolvedValueOnce([job('job-1', 'RUNNING')] as never)
      .mockResolvedValueOnce([
        job('job-1', 'CANCELLED', 'fal', 'fal-req-123'),
      ] as never)
    mockUpdateMany.mockResolvedValue({ count: 1 })

    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await cancelGenerationJobs('clerk-1', ['job-1'])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({
      jobId: 'job-1',
      workflowInstanceId: 'job-1',
      provider: 'fal',
      providerJobId: 'fal-req-123',
    })
  })

  it('omits providerJobId from the worker cancel payload when the job has none', async () => {
    mockFindMany
      .mockResolvedValueOnce([job('job-1', 'RUNNING')] as never)
      .mockResolvedValueOnce([job('job-1', 'CANCELLED')] as never)
    mockUpdateMany.mockResolvedValue({ count: 1 })

    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await cancelGenerationJobs('clerk-1', ['job-1'])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const parsedBody = JSON.parse(init.body as string)
    expect(parsedBody).not.toHaveProperty('providerJobId')
    expect(parsedBody).toEqual({
      jobId: 'job-1',
      workflowInstanceId: 'job-1',
      provider: 'fal',
    })
  })
})
