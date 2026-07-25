/**
 * WP-Usage-01 · Job↔Ledger unit tests
 *
 * 5 paths:
 *   1. createGenerationJob creates with RUNNING status
 *   2. completeGenerationJob sets COMPLETED + links generationId
 *   3. failGenerationJob sets FAILED + preserves errorMessage
 *   4. createApiUsageEntry applies defaults (requestCount=1)
 *   5. attachUsageEntryToGeneration links usage→generation
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { PLATFORM_GENERATION_GUARD } from '@/constants/config'

// ─── Mocks ──────────────────────────────────────────────────────

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockUpdateMany = vi.fn()
const mockFindUnique = vi.fn()
const mockAggregate = vi.fn()
const mockFindFirst = vi.fn()
const mockJobCount = vi.fn()
const mockSlotCount = vi.fn()
const mockSlotCreate = vi.fn()
const mockExecuteRaw = vi.fn().mockResolvedValue(1)
const mockDbTransaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
  fn({
    generationJob: {
      count: (...args: unknown[]) => mockJobCount(...args),
      create: (...args: unknown[]) => mockCreate(...args),
    },
    freeTierSlot: {
      count: (...args: unknown[]) => mockSlotCount(...args),
      create: (...args: unknown[]) => mockSlotCreate(...args),
    },
    $executeRaw: (...args: unknown[]) => mockExecuteRaw(...args),
  }),
)

vi.mock('@/lib/db', () => ({
  db: {
    generationJob: {
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      count: (...args: unknown[]) => mockJobCount(...args),
    },
    apiUsageLedger: {
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      aggregate: (...args: unknown[]) => mockAggregate(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
    },
    generation: {
      count: vi.fn(),
    },
    freeTierSlot: {
      count: (...args: unknown[]) => mockSlotCount(...args),
      create: (...args: unknown[]) => mockSlotCreate(...args),
    },
    $transaction: (...args: Parameters<typeof mockDbTransaction>) =>
      mockDbTransaction(...args),
  },
}))

import {
  createGenerationJob,
  completeGenerationJob,
  failGenerationJob,
  failActiveGenerationJob,
  createApiUsageEntry,
  attachUsageEntryToGeneration,
  atomicReserveFreeTierSlot,
  getFreeTierSlotsUsedToday,
  getRunnerMonthlyGenerationCount,
  getRunnerUsage,
  assertRunnerMonthlyLimitNotExceeded,
  RunnerMonthlyLimitExceededError,
  ActiveGenerationLimitExceededError,
  PlatformDailyLimitExceededError,
  PlatformGenerationDisabledError,
} from './usage.service'

// ─── Tests ──────────────────────────────────────────────────────

describe('usage.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreate.mockReset()
    mockJobCount.mockReset().mockResolvedValue(0)
    mockSlotCount.mockReset().mockResolvedValue(0)
    mockSlotCreate.mockReset().mockResolvedValue({ id: 'slot-1' })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('createGenerationJob', () => {
    it('creates job with RUNNING status and startedAt', async () => {
      const mockJob = {
        id: 'job-1',
        status: 'RUNNING',
        startedAt: new Date(),
        userId: 'user-1',
      }
      mockCreate.mockResolvedValue(mockJob)

      const result = await createGenerationJob({
        userId: 'user-1',
        adapterType: 'fal',
        provider: 'fal.ai',
        modelId: 'fal-ai/flux-2-pro',
      })

      expect(result.status).toBe('RUNNING')
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            adapterType: 'fal',
            provider: 'fal.ai',
            modelId: 'fal-ai/flux-2-pro',
            status: 'RUNNING',
          }),
        }),
      )
    })

    it('serializes the RUNNER monthly limit check and job creation in one transaction', async () => {
      mockJobCount.mockResolvedValueOnce(299).mockResolvedValueOnce(0)
      mockCreate.mockResolvedValue({ id: 'runner-job-1', status: 'RUNNING' })

      await createGenerationJob({
        userId: 'user-1',
        adapterType: AI_ADAPTER_TYPES.RUNNER,
        provider: 'PixelVault Runner',
        modelId: 'anima-pencil-xl-runner',
      })

      expect(mockDbTransaction).toHaveBeenCalledOnce()
      expect(mockExecuteRaw).toHaveBeenCalledTimes(2)
      expect(mockJobCount).toHaveBeenCalledTimes(2)
      expect(mockCreate).toHaveBeenCalledOnce()
      expect(mockExecuteRaw.mock.invocationCallOrder[0]).toBeLessThan(
        mockJobCount.mock.invocationCallOrder[0],
      )
      expect(mockJobCount.mock.invocationCallOrder[0]).toBeLessThan(
        mockCreate.mock.invocationCallOrder[0],
      )
    })

    it('does not create a RUNNER job when the locked monthly count is at the limit', async () => {
      mockJobCount.mockResolvedValue(300)

      await expect(
        createGenerationJob({
          userId: 'user-1',
          adapterType: AI_ADAPTER_TYPES.RUNNER,
          provider: 'PixelVault Runner',
          modelId: 'anima-pencil-xl-runner',
        }),
      ).rejects.toThrow(RunnerMonthlyLimitExceededError)

      expect(mockExecuteRaw).toHaveBeenCalledOnce()
      expect(mockJobCount).toHaveBeenCalledOnce()
      expect(mockCreate).not.toHaveBeenCalled()
    })

    it('does not create a third active job for the same user', async () => {
      mockJobCount.mockResolvedValue(2)

      await expect(
        createGenerationJob({
          userId: 'user-1',
          adapterType: AI_ADAPTER_TYPES.FAL,
          provider: 'fal.ai',
          modelId: 'fal-ai/flux-2-pro',
        }),
      ).rejects.toThrow(ActiveGenerationLimitExceededError)

      expect(mockCreate).not.toHaveBeenCalled()
      expect(mockJobCount).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          status: { in: ['QUEUED', 'RUNNING'] },
          createdAt: { gte: expect.any(Date) },
        },
      })
    })

    // 2026-07-26 事故：回调丢了的 job 永远停在 RUNNING，把并发位永久扣死，
    // 账号从此再也出不了图且不会自愈。闸必须只数还在时效内的活跃 job。
    it('ignores active jobs older than the max age so a lost callback cannot wedge the user', async () => {
      mockJobCount.mockResolvedValue(0)

      await createGenerationJob({
        userId: 'user-1',
        adapterType: AI_ADAPTER_TYPES.FAL,
        provider: 'fal.ai',
        modelId: 'fal-ai/flux-2-pro',
      })

      const where = mockJobCount.mock.calls.at(-1)?.[0]?.where as {
        createdAt: { gte: Date }
      }
      const cutoffAgeMs = Date.now() - where.createdAt.gte.getTime()
      expect(cutoffAgeMs).toBeGreaterThan(
        PLATFORM_GENERATION_GUARD.ACTIVE_JOB_MAX_AGE_MS - 5_000,
      )
      expect(cutoffAgeMs).toBeLessThan(
        PLATFORM_GENERATION_GUARD.ACTIVE_JOB_MAX_AGE_MS + 5_000,
      )
      expect(mockCreate).toHaveBeenCalled()
    })
  })

  describe('completeGenerationJob', () => {
    it('sets COMPLETED status and links generationId', async () => {
      const mockJob = {
        id: 'job-1',
        status: 'COMPLETED',
        completedAt: new Date(),
        generationId: 'gen-1',
        errorMessage: null,
      }
      mockUpdate.mockResolvedValue(mockJob)

      const result = await completeGenerationJob('job-1', {
        generationId: 'gen-1',
        requestCount: 2,
      })

      expect(result.status).toBe('COMPLETED')
      expect(result.errorMessage).toBeNull()
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'job-1' },
          data: expect.objectContaining({
            status: 'COMPLETED',
            generationId: 'gen-1',
            requestCount: 2,
            errorMessage: null,
          }),
        }),
      )
    })
  })

  describe('failGenerationJob', () => {
    it('sets FAILED status and preserves errorMessage', async () => {
      const mockJob = {
        id: 'job-1',
        status: 'FAILED',
        completedAt: new Date(),
        errorMessage: 'Provider timeout',
      }
      mockUpdate.mockResolvedValue(mockJob)

      const result = await failGenerationJob('job-1', {
        requestCount: 1,
        errorMessage: 'Provider timeout',
      })

      expect(result.status).toBe('FAILED')
      expect(result.errorMessage).toBe('Provider timeout')
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'job-1' },
          data: expect.objectContaining({
            status: 'FAILED',
            errorMessage: 'Provider timeout',
          }),
        }),
      )
    })
  })

  describe('failActiveGenerationJob', () => {
    it('preserves a terminal job and reports its real status when the failure CAS loses', async () => {
      mockUpdateMany.mockResolvedValue({ count: 0 })
      mockFindUnique.mockResolvedValue({ status: 'COMPLETED' })

      const result = await failActiveGenerationJob('job-1', {
        requestCount: 1,
        errorMessage: 'late provider failure',
      })

      expect(result).toEqual({ transitioned: false, status: 'COMPLETED' })
      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: {
          id: 'job-1',
          status: { in: ['QUEUED', 'RUNNING'] },
        },
        data: expect.objectContaining({
          status: 'FAILED',
          errorMessage: 'late provider failure',
        }),
      })
    })
  })

  describe('createApiUsageEntry', () => {
    it('applies defaults: requestCount=1, outputImageCount=1, inputImageCount=0', async () => {
      const mockEntry = { id: 'entry-1' }
      mockCreate.mockResolvedValue(mockEntry)

      await createApiUsageEntry({
        userId: 'user-1',
        adapterType: 'fal',
        provider: 'fal.ai',
        modelId: 'fal-ai/flux-2-pro',
        wasSuccessful: true,
      })

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            requestCount: 1,
            outputImageCount: 1,
            inputImageCount: 0,
            wasSuccessful: true,
          }),
        }),
      )
    })

    it('uses explicit requestCount when provided', async () => {
      mockCreate.mockResolvedValue({ id: 'entry-2' })

      await createApiUsageEntry({
        userId: 'user-1',
        adapterType: 'fal',
        provider: 'fal.ai',
        modelId: 'fal-ai/flux-2-pro',
        requestCount: 3,
        wasSuccessful: true,
      })

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            requestCount: 3,
          }),
        }),
      )
    })
  })

  describe('attachUsageEntryToGeneration', () => {
    it('links usage entry to generation via update', async () => {
      mockUpdate.mockResolvedValue({ id: 'entry-1', generationId: 'gen-1' })

      const result = await attachUsageEntryToGeneration('entry-1', 'gen-1')

      expect(result.generationId).toBe('gen-1')
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'entry-1' },
          data: { generationId: 'gen-1' },
        }),
      )
    })
  })

  describe('atomicReserveFreeTierSlot', () => {
    it('creates a slot when count is under daily limit (19 < 20)', async () => {
      mockSlotCount.mockResolvedValue(19)

      await atomicReserveFreeTierSlot('user-1')

      expect(mockSlotCreate).toHaveBeenCalledOnce()
      expect(mockSlotCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'user-1' }),
        }),
      )
    })

    it('throws with code FREE_LIMIT_EXCEEDED when count equals daily limit (20 >= 20)', async () => {
      mockSlotCount.mockResolvedValue(20)

      await expect(atomicReserveFreeTierSlot('user-1')).rejects.toMatchObject({
        code: 'FREE_LIMIT_EXCEEDED',
      })
      expect(mockSlotCreate).not.toHaveBeenCalled()
    })

    it('throws with code FREE_LIMIT_EXCEEDED when count exceeds daily limit (25 > 20)', async () => {
      mockSlotCount.mockResolvedValue(25)

      await expect(atomicReserveFreeTierSlot('user-1')).rejects.toMatchObject({
        code: 'FREE_LIMIT_EXCEEDED',
      })
    })

    it('acquires a per-(user,date) advisory lock before counting', async () => {
      mockSlotCount.mockResolvedValue(0)

      await atomicReserveFreeTierSlot('user-1')

      expect(mockExecuteRaw).toHaveBeenCalledOnce()
      // Lock acquisition runs before any slot read so concurrent reservers
      // for the same user serialize through the lock rather than racing.
      const lockCallOrder = mockExecuteRaw.mock.invocationCallOrder[0]
      const countCallOrder = mockSlotCount.mock.invocationCallOrder[0]
      expect(lockCallOrder).toBeLessThan(countCallOrder)
    })

    it('re-throws unexpected create errors unchanged', async () => {
      mockSlotCount.mockResolvedValue(19)
      mockSlotCreate.mockRejectedValue(new Error('connection refused'))

      await expect(atomicReserveFreeTierSlot('user-1')).rejects.toThrow(
        'connection refused',
      )
    })

    it('fails closed in production when the platform generation switch is not explicitly enabled', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('PLATFORM_GENERATION_ENABLED', '')

      await expect(atomicReserveFreeTierSlot('user-1')).rejects.toThrow(
        PlatformGenerationDisabledError,
      )
      expect(mockSlotCreate).not.toHaveBeenCalled()
    })

    it('rejects atomically when the global daily platform budget is exhausted', async () => {
      mockSlotCount.mockResolvedValueOnce(500)

      await expect(atomicReserveFreeTierSlot('user-1')).rejects.toThrow(
        PlatformDailyLimitExceededError,
      )
      expect(mockSlotCreate).not.toHaveBeenCalled()
      expect(mockSlotCount).toHaveBeenCalledWith({
        where: { date: expect.any(String) },
      })
    })
  })

  describe('getFreeTierSlotsUsedToday', () => {
    it('counts reserved free-tier slots for the current UTC date', async () => {
      mockSlotCount.mockResolvedValue(7)

      const result = await getFreeTierSlotsUsedToday('user-1')
      const today = new Date().toISOString().slice(0, 10)

      expect(result).toBe(7)
      expect(mockSlotCount).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          date: today,
        },
      })
    })
  })

  describe('getRunnerMonthlyGenerationCount', () => {
    it('counts GenerationJob rows for the RUNNER adapter since the start of the UTC month', async () => {
      mockJobCount.mockResolvedValue(42)

      const result = await getRunnerMonthlyGenerationCount()

      expect(result).toBe(42)
      expect(mockJobCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ adapterType: 'runner' }),
        }),
      )
      const call = mockJobCount.mock.calls[0]?.[0] as {
        where: { createdAt: { gte: Date } }
      }
      expect(call.where.createdAt.gte.getUTCDate()).toBe(1)
      expect(call.where.createdAt.gte.getUTCHours()).toBe(0)
    })
  })

  describe('getRunnerUsage', () => {
    it('returns used/limit/remaining from the global monthly count', async () => {
      mockJobCount.mockResolvedValue(40)

      const result = await getRunnerUsage()

      expect(result).toEqual({
        enabled: true,
        used: 40,
        limit: 300,
        remaining: 260,
      })
    })

    it('clamps remaining at 0 when already over the limit', async () => {
      mockJobCount.mockResolvedValue(320)

      const result = await getRunnerUsage()

      expect(result.used).toBe(320)
      expect(result.remaining).toBe(0)
    })
  })

  describe('assertRunnerMonthlyLimitNotExceeded', () => {
    it('resolves when the monthly count is under the limit (299 < 300)', async () => {
      mockJobCount.mockResolvedValue(299)

      await expect(
        assertRunnerMonthlyLimitNotExceeded(),
      ).resolves.toBeUndefined()
    })

    it('throws RunnerMonthlyLimitExceededError when the count equals the limit (300 >= 300)', async () => {
      mockJobCount.mockResolvedValue(300)

      await expect(assertRunnerMonthlyLimitNotExceeded()).rejects.toThrow(
        RunnerMonthlyLimitExceededError,
      )
      await expect(assertRunnerMonthlyLimitNotExceeded()).rejects.toMatchObject(
        {
          code: 'RUNNER_MONTHLY_LIMIT_EXCEEDED',
        },
      )
    })

    it('throws when the count exceeds the limit (301 > 300)', async () => {
      mockJobCount.mockResolvedValue(301)

      await expect(assertRunnerMonthlyLimitNotExceeded()).rejects.toThrow(
        RunnerMonthlyLimitExceededError,
      )
    })
  })
})
