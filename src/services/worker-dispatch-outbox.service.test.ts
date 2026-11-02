import { beforeEach, describe, expect, it, vi } from 'vitest'

import { WORKER_DISPATCH_OUTBOX } from '@/constants/execution'
import { GENERATION_ERROR_CODES } from '@/constants/generation-errors'

const mockUpsert = vi.fn()
const mockUpdate = vi.fn()
const mockUpdateMany = vi.fn()
const mockFindUnique = vi.fn()
const mockFindMany = vi.fn()
const mockDispatch = vi.fn()
const mockFailActive = vi.fn()

vi.mock('server-only', () => ({}))
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))
vi.mock('@/lib/db', () => ({
  db: {
    executionOutbox: {
      upsert: (...args: unknown[]) => mockUpsert(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}))
vi.mock('@/services/execution-worker.service', () => ({
  ExecutionWorkerDispatchError: class ExecutionWorkerDispatchError extends Error {
    readonly outcome: 'rejected' | 'unknown'
    readonly upstreamStatus?: number
    constructor(message: string, outcome: 'rejected' | 'unknown') {
      super(message)
      this.outcome = outcome
    }
  },
  dispatchExecutionWorkerRun: (...args: unknown[]) => mockDispatch(...args),
}))
vi.mock('@/services/usage.service', () => ({
  createGenerationJob: vi.fn(),
  failActiveGenerationJob: (...args: unknown[]) => mockFailActive(...args),
}))

import { ExecutionWorkerDispatchError } from '@/services/execution-worker.service'
import type { WorkerRunContext } from '@/types'
import {
  dispatchWorkerRunDurably,
  reconcileWorkerDispatch,
  sweepWorkerDispatchOutboxes,
} from './worker-dispatch-outbox.service'

const RUN_CONTEXT: WorkerRunContext = {
  runId: 'job-1',
  workflowId: 'IMAGE_QUEUE',
  outputType: 'IMAGE',
  providerId: 'openai',
  apiKeyId: 'key-1',
  callbackUrl: 'https://app.test/api/internal/execution/callback',
  resolveKeyUrl: 'https://app.test/api/internal/execution/resolve-key',
  timeoutMs: 600_000,
  maxAttempts: 1,
  pollIntervalMs: 3_000,
  providerInput: {
    prompt: 'a cat',
    modelId: 'gpt-image',
    externalModelId: 'gpt-image-1',
    aspectRatio: '1:1',
  },
}

const NOW = new Date('2026-11-02T08:00:00.000Z')

function outboxRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'outbox-1',
    generationJobId: 'job-1',
    kind: 'WORKER_DISPATCH',
    status: 'PENDING',
    payload: { phase: 'ready', runContext: RUN_CONTEXT },
    attemptCount: 1,
    leaseExpiresAt: null,
    createdAt: new Date(NOW.getTime() - 60_000),
    updatedAt: new Date(
      NOW.getTime() - WORKER_DISPATCH_OUTBOX.REDELIVERY_DELAY_MS - 1,
    ),
    ...overrides,
  }
}

function lastUpdateData() {
  return mockUpdate.mock.calls.at(-1)?.[0].data
}

describe('worker-dispatch-outbox.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpsert.mockResolvedValue({ id: 'outbox-1' })
    mockUpdateMany.mockResolvedValue({ count: 1 })
    mockUpdate.mockResolvedValue({})
    mockDispatch.mockResolvedValue({ workflowInstanceId: 'job-1' })
    mockFailActive.mockResolvedValue({ transitioned: true, status: 'FAILED' })
  })

  describe('dispatchWorkerRunDurably', () => {
    it('records the run context, dispatches once and completes the outbox', async () => {
      await expect(dispatchWorkerRunDurably(RUN_CONTEXT)).resolves.toEqual({
        delivered: true,
        workflowInstanceId: 'job-1',
      })

      expect(mockUpsert.mock.calls[0][0].update.payload).toEqual({
        phase: 'ready',
        runContext: RUN_CONTEXT,
      })
      expect(mockDispatch).toHaveBeenCalledWith(RUN_CONTEXT)
      expect(lastUpdateData()).toMatchObject({ status: 'COMPLETED' })
    })

    it('keeps the outbox pending when the dispatch outcome is unknown', async () => {
      mockDispatch.mockRejectedValue(
        new ExecutionWorkerDispatchError('timed out', 'unknown'),
      )

      await expect(dispatchWorkerRunDurably(RUN_CONTEXT)).resolves.toEqual({
        delivered: false,
      })
      expect(lastUpdateData()).toMatchObject({
        status: 'PENDING',
        lastError: 'timed out',
      })
    })

    it('fails the outbox and rethrows a definite rejection', async () => {
      mockDispatch.mockRejectedValue(
        new ExecutionWorkerDispatchError('bad params', 'rejected'),
      )

      await expect(dispatchWorkerRunDurably(RUN_CONTEXT)).rejects.toThrow(
        'bad params',
      )
      expect(lastUpdateData()).toMatchObject({ status: 'FAILED' })
    })

    it('does not dispatch when another request holds the lease', async () => {
      mockUpdateMany.mockResolvedValue({ count: 0 })

      await expect(dispatchWorkerRunDurably(RUN_CONTEXT)).resolves.toEqual({
        delivered: false,
      })
      expect(mockDispatch).not.toHaveBeenCalled()
    })
  })

  describe('reconcileWorkerDispatch', () => {
    const job = { id: 'job-1', status: 'RUNNING' }

    it('ignores jobs that are no longer running', async () => {
      await expect(
        reconcileWorkerDispatch({ id: 'job-1', status: 'COMPLETED' }, NOW),
      ).resolves.toBeNull()
      expect(mockFindUnique).not.toHaveBeenCalled()
    })

    it('ignores jobs without a dispatch outbox and delivered outboxes', async () => {
      mockFindUnique.mockResolvedValueOnce(null)
      await expect(reconcileWorkerDispatch(job, NOW)).resolves.toBeNull()

      mockFindUnique.mockResolvedValueOnce(outboxRow({ status: 'COMPLETED' }))
      await expect(reconcileWorkerDispatch(job, NOW)).resolves.toBeNull()
      expect(mockDispatch).not.toHaveBeenCalled()
    })

    it('redelivers a pending outbox once the retry delay has passed', async () => {
      mockFindUnique.mockResolvedValue(outboxRow())

      await expect(reconcileWorkerDispatch(job, NOW)).resolves.toBeNull()
      expect(mockDispatch).toHaveBeenCalledWith(RUN_CONTEXT)
      expect(lastUpdateData()).toMatchObject({ status: 'COMPLETED' })
    })

    it('waits out the retry delay before redelivering', async () => {
      mockFindUnique.mockResolvedValue(
        outboxRow({ updatedAt: new Date(NOW.getTime() - 1_000) }),
      )

      await expect(reconcileWorkerDispatch(job, NOW)).resolves.toBeNull()
      expect(mockDispatch).not.toHaveBeenCalled()
    })

    it('redelivers a processing outbox whose lease expired', async () => {
      mockFindUnique.mockResolvedValue(
        outboxRow({
          status: 'PROCESSING',
          leaseExpiresAt: new Date(NOW.getTime() - 1),
          updatedAt: NOW,
        }),
      )

      await reconcileWorkerDispatch(job, NOW)
      expect(mockDispatch).toHaveBeenCalledTimes(1)
    })

    it('fails the job fast once delivery attempts are exhausted', async () => {
      mockFindUnique.mockResolvedValue(
        outboxRow({
          attemptCount: WORKER_DISPATCH_OUTBOX.MAX_DELIVERY_ATTEMPTS,
        }),
      )

      const failure = await reconcileWorkerDispatch(job, NOW)

      expect(failure?.errorCode).toBe(
        GENERATION_ERROR_CODES.EXECUTION_WORKER_UNAVAILABLE,
      )
      expect(mockDispatch).not.toHaveBeenCalled()
      expect(mockFailActive).toHaveBeenCalledWith(
        'job-1',
        expect.objectContaining({
          errorCode: GENERATION_ERROR_CODES.EXECUTION_WORKER_UNAVAILABLE,
        }),
      )
    })

    it('fails a job abandoned before its run context was written', async () => {
      mockFindUnique.mockResolvedValue(
        outboxRow({
          payload: { phase: 'preparing' },
          createdAt: new Date(
            NOW.getTime() - WORKER_DISPATCH_OUTBOX.PREPARE_TIMEOUT_MS - 1,
          ),
        }),
      )

      const failure = await reconcileWorkerDispatch(job, NOW)

      expect(failure?.errorCode).toBe(
        GENERATION_ERROR_CODES.EXECUTION_WORKER_UNAVAILABLE,
      )
    })

    it('leaves a job that is still preparing alone', async () => {
      mockFindUnique.mockResolvedValue(
        outboxRow({ payload: { phase: 'preparing' } }),
      )

      await expect(reconcileWorkerDispatch(job, NOW)).resolves.toBeNull()
      expect(mockFailActive).not.toHaveBeenCalled()
    })

    it('fails the job when a redelivery is definitely rejected', async () => {
      mockFindUnique.mockResolvedValue(outboxRow())
      mockDispatch.mockRejectedValue(
        new ExecutionWorkerDispatchError('bad params', 'rejected'),
      )

      const failure = await reconcileWorkerDispatch(job, NOW)

      expect(failure?.errorCode).toBe(
        GENERATION_ERROR_CODES.EXECUTION_REQUEST_REJECTED,
      )
    })

    it('reports nothing when a late callback already finished the job', async () => {
      mockFindUnique.mockResolvedValue(
        outboxRow({
          attemptCount: WORKER_DISPATCH_OUTBOX.MAX_DELIVERY_ATTEMPTS,
        }),
      )
      mockFailActive.mockResolvedValue({
        transitioned: false,
        status: 'COMPLETED',
      })

      await expect(reconcileWorkerDispatch(job, NOW)).resolves.toBeNull()
    })
  })

  describe('sweepWorkerDispatchOutboxes', () => {
    it('closes outboxes whose job is no longer running and redelivers the rest', async () => {
      mockFindMany.mockResolvedValue([
        {
          id: 'outbox-old',
          generationJob: { id: 'job-0', status: 'CANCELLED' },
        },
        { id: 'outbox-1', generationJob: { id: 'job-1', status: 'RUNNING' } },
      ])
      mockFindUnique.mockResolvedValue(outboxRow())

      const result = await sweepWorkerDispatchOutboxes(NOW)

      expect(result).toEqual({ redelivered: 1, failed: 0, closed: 1 })
      expect(mockUpdate.mock.calls[0][0]).toMatchObject({
        where: { id: 'outbox-old' },
        data: { status: 'FAILED' },
      })
      expect(mockDispatch).toHaveBeenCalledTimes(1)
    })
  })
})
