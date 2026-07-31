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
import {
  PLATFORM_GENERATION_GUARD,
  RUNAWAY_GENERATION_GUARD,
} from '@/constants/config'

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
  RunawayGenerationLimitExceededError,
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

    it('serializes the runaway-rate check, RUNNER monthly limit check, active-job check, and job creation in one transaction', async () => {
      mockJobCount
        .mockResolvedValueOnce(0) // runaway hour window
        .mockResolvedValueOnce(0) // runaway day window
        .mockResolvedValueOnce(299) // runner monthly
        .mockResolvedValueOnce(0) // active jobs (RUNNER is always platform-funded)
      mockCreate.mockResolvedValue({ id: 'runner-job-1', status: 'RUNNING' })

      await createGenerationJob({
        userId: 'user-1',
        adapterType: AI_ADAPTER_TYPES.RUNNER,
        provider: 'PixelVault Runner',
        modelId: 'anima-pencil-xl-runner',
      })

      expect(mockDbTransaction).toHaveBeenCalledOnce()
      expect(mockExecuteRaw).toHaveBeenCalledTimes(3)
      expect(mockJobCount).toHaveBeenCalledTimes(4)
      expect(mockCreate).toHaveBeenCalledOnce()
      expect(Math.min(...mockExecuteRaw.mock.invocationCallOrder)).toBeLessThan(
        Math.min(...mockJobCount.mock.invocationCallOrder),
      )
      expect(Math.max(...mockJobCount.mock.invocationCallOrder)).toBeLessThan(
        mockCreate.mock.invocationCallOrder[0],
      )
    })

    it('does not create a RUNNER job when the locked monthly count is at the limit', async () => {
      mockJobCount
        .mockResolvedValueOnce(0) // runaway hour window — under limit
        .mockResolvedValueOnce(0) // runaway day window — under limit
        .mockResolvedValueOnce(300) // runner monthly — at limit

      await expect(
        createGenerationJob({
          userId: 'user-1',
          adapterType: AI_ADAPTER_TYPES.RUNNER,
          provider: 'PixelVault Runner',
          modelId: 'anima-pencil-xl-runner',
        }),
      ).rejects.toThrow(RunnerMonthlyLimitExceededError)

      expect(mockExecuteRaw).toHaveBeenCalledTimes(2) // runaway lock + runner lock
      expect(mockJobCount).toHaveBeenCalledTimes(3)
      expect(mockCreate).not.toHaveBeenCalled()
    })

    it('does not create a fifth active job for the same platform-funded user (limit raised 2→4, 2026-07-28)', async () => {
      mockJobCount
        .mockResolvedValueOnce(0) // runaway hour window — under limit
        .mockResolvedValueOnce(0) // runaway day window — under limit
        .mockResolvedValueOnce(
          PLATFORM_GENERATION_GUARD.MAX_ACTIVE_JOBS_PER_USER,
        ) // active jobs — at limit

      await expect(
        createGenerationJob({
          userId: 'user-1',
          adapterType: AI_ADAPTER_TYPES.FAL,
          provider: 'fal.ai',
          modelId: 'fal-ai/flux-2-pro',
          // isPlatformFunded omitted on purpose — proves the default gates.
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

    // 2026-07-28 owner:「平台限制到 4 把。自己的 api 不做限制」——BYOK 不占平台
    // 资源，并发闸不该拦它。
    it('does not apply the active-job cap when the caller is not platform-funded (BYOK)', async () => {
      mockJobCount
        .mockResolvedValueOnce(0) // runaway hour window
        .mockResolvedValueOnce(0) // runaway day window
      mockCreate.mockResolvedValue({ id: 'byok-job-1', status: 'RUNNING' })

      const result = await createGenerationJob({
        userId: 'user-1',
        adapterType: AI_ADAPTER_TYPES.FAL,
        provider: 'fal.ai',
        modelId: 'fal-ai/flux-2-pro',
        isPlatformFunded: false,
      })

      expect(result.id).toBe('byok-job-1')
      // Only the runaway-rate check ran count queries (hour + day) — no
      // active-job read at all.
      expect(mockJobCount).toHaveBeenCalledTimes(2)
      expect(mockCreate).toHaveBeenCalledOnce()
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

    // 2026-07-28 owner:「死循环还是要做一个闸门」——防「发一条→等它完→再发一条」
    // 的慢速循环，永远只有 1 个活跃 job，撞不上并发闸。
    describe('runaway generation rate gate', () => {
      it('rejects when the hourly request count from this account is at the limit', async () => {
        mockJobCount.mockResolvedValueOnce(RUNAWAY_GENERATION_GUARD.HOUR_LIMIT)

        await expect(
          createGenerationJob({
            userId: 'user-1',
            adapterType: AI_ADAPTER_TYPES.FAL,
            provider: 'fal.ai',
            modelId: 'fal-ai/flux-2-pro',
          }),
        ).rejects.toThrow(RunawayGenerationLimitExceededError)

        expect(mockCreate).not.toHaveBeenCalled()
      })

      // 2026-07-28 owner 定值时补的日档：小时档管不住「每小时单看都合规、但连跑
      // 一整夜」的循环，而那正是 BYOK 解除并发限制后最贵的失控形态。这里让小时
      // 档先过（第一次 count 返回 0），坐实是日档拦下的。
      it('rejects on the daily limit even when the hourly count is well under', async () => {
        mockJobCount
          .mockResolvedValueOnce(0)
          .mockResolvedValueOnce(RUNAWAY_GENERATION_GUARD.DAY_LIMIT)

        await expect(
          createGenerationJob({
            userId: 'user-1',
            adapterType: AI_ADAPTER_TYPES.FAL,
            provider: 'fal.ai',
            modelId: 'fal-ai/flux-2-pro',
            isPlatformFunded: false,
          }),
        ).rejects.toThrow(RunawayGenerationLimitExceededError)

        expect(mockJobCount).toHaveBeenCalledTimes(2)
        expect(mockCreate).not.toHaveBeenCalled()
      })

      // 对所有路径生效——不分平台掏钱还是 BYOK。
      it('applies even when the caller is not platform-funded (BYOK)', async () => {
        mockJobCount.mockResolvedValueOnce(RUNAWAY_GENERATION_GUARD.HOUR_LIMIT)

        await expect(
          createGenerationJob({
            userId: 'user-1',
            adapterType: AI_ADAPTER_TYPES.FAL,
            provider: 'fal.ai',
            modelId: 'fal-ai/flux-2-pro',
            isPlatformFunded: false,
          }),
        ).rejects.toThrow(RunawayGenerationLimitExceededError)

        expect(mockCreate).not.toHaveBeenCalled()
      })

      // 失控优先拦：即使 RUNNER 月度额度也没超，命中失控闸也必须先失败在这一步。
      it('is checked before the RUNNER monthly budget', async () => {
        mockJobCount.mockResolvedValueOnce(RUNAWAY_GENERATION_GUARD.HOUR_LIMIT)

        await expect(
          createGenerationJob({
            userId: 'user-1',
            adapterType: AI_ADAPTER_TYPES.RUNNER,
            provider: 'PixelVault Runner',
            modelId: 'anima-pencil-xl-runner',
          }),
        ).rejects.toThrow(RunawayGenerationLimitExceededError)

        // Only the runaway lock+count ran; the RUNNER monthly check never got
        // a chance to run.
        expect(mockExecuteRaw).toHaveBeenCalledOnce()
        expect(mockJobCount).toHaveBeenCalledOnce()
        expect(mockCreate).not.toHaveBeenCalled()
      })

      // 2026-07-28 owner 纠正：按账户（userId）计数，不是全站汇总——死循环是某
      // 一个账号的 bug，不该让全站陪葬。
      it('scopes the hourly count to the calling user, not the whole platform', async () => {
        mockJobCount.mockResolvedValueOnce(0)

        await createGenerationJob({
          userId: 'user-42',
          adapterType: AI_ADAPTER_TYPES.FAL,
          provider: 'fal.ai',
          modelId: 'fal-ai/flux-2-pro',
        })

        expect(mockJobCount).toHaveBeenCalledWith({
          where: {
            userId: 'user-42',
            createdAt: { gte: expect.any(Date) },
          },
        })
      })
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
        platformEnabled: true,
      })
    })

    it('clamps remaining at 0 when already over the limit', async () => {
      mockJobCount.mockResolvedValue(320)

      const result = await getRunnerUsage()

      expect(result.used).toBe(320)
      expect(result.remaining).toBe(0)
    })

    // 回归：额度快照和派发路径必须查同一个总闸。曾经只有派发查，快照不查，于是
    // LoRA 工作台报着「剩余 260/300」而每一次出图都被 503 拒掉（2026-07-31 生产）。
    it('reports platformEnabled=false when the platform switch is off, even with budget left', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('PLATFORM_GENERATION_ENABLED', '')
      mockJobCount.mockResolvedValue(40)

      const result = await getRunnerUsage()

      expect(result.platformEnabled).toBe(false)
      expect(result.remaining).toBe(260)
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
