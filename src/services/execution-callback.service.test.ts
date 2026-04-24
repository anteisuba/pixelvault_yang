import { describe, it, expect, vi, beforeEach } from 'vitest'

import type { ExecutionCallbackPayload } from '@/types'
import { ApiRequestError } from '@/lib/errors'

// ─── Mocks ──────────────────────────────────────────────────────

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const mockFindUnique = vi.fn()
const mockUpdate = vi.fn()

vi.mock('@/lib/db', () => ({
  db: {
    generationJob: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}))

import { handleExecutionCallback } from './execution-callback.service'

// ─── Fixtures ───────────────────────────────────────────────────

type CallbackKind = ExecutionCallbackPayload['kind']
type JobStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED'

function buildPayload(
  kind: CallbackKind,
  runId = 'job-1',
): ExecutionCallbackPayload {
  return {
    runId,
    kind,
    ts: '2026-04-24T00:00:00.000Z',
    data: { source: 'test' },
  }
}

function buildJob(status: JobStatus) {
  return {
    id: 'job-1',
    status,
  }
}

// ─── Tests ──────────────────────────────────────────────────────

describe('execution-callback.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws 404 EXECUTION_RUN_NOT_FOUND when runId does not match a generationJob', async () => {
    mockFindUnique.mockResolvedValue(null)

    const result = handleExecutionCallback(buildPayload('ping', 'missing-job'))

    await expect(result).rejects.toBeInstanceOf(ApiRequestError)
    await expect(result).rejects.toMatchObject({
      errorCode: 'EXECUTION_RUN_NOT_FOUND',
      httpStatus: 404,
    })

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { id: 'missing-job' },
      select: { id: true, status: true },
    })
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('logs ping callbacks for a pending job without changing job status', async () => {
    mockFindUnique.mockResolvedValue(buildJob('RUNNING'))

    const result = await handleExecutionCallback(buildPayload('ping'))

    expect(result).toEqual({
      runId: 'job-1',
      jobStatus: 'RUNNING',
      action: 'logged',
    })
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('logs status callbacks for a pending job without changing job status', async () => {
    mockFindUnique.mockResolvedValue(buildJob('RUNNING'))

    const result = await handleExecutionCallback(buildPayload('status'))

    expect(result).toEqual({
      runId: 'job-1',
      jobStatus: 'RUNNING',
      action: 'logged',
    })
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('logs result callbacks for a pending job without finalizing yet', async () => {
    mockFindUnique.mockResolvedValue(buildJob('RUNNING'))

    const result = await handleExecutionCallback(buildPayload('result'))

    expect(result).toEqual({
      runId: 'job-1',
      jobStatus: 'RUNNING',
      action: 'logged',
    })
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('ignores result callbacks for an already COMPLETED job idempotently', async () => {
    mockFindUnique.mockResolvedValue(buildJob('COMPLETED'))

    const result = await handleExecutionCallback(buildPayload('result'))

    expect(result).toEqual({
      runId: 'job-1',
      jobStatus: 'COMPLETED',
      action: 'ignored-terminal',
    })
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('ignores result callbacks for an already FAILED job idempotently', async () => {
    mockFindUnique.mockResolvedValue(buildJob('FAILED'))

    const result = await handleExecutionCallback(buildPayload('result'))

    expect(result).toEqual({
      runId: 'job-1',
      jobStatus: 'FAILED',
      action: 'ignored-terminal',
    })
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})
