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

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ──────────────────────────────────────────────────────

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockAggregate = vi.fn()
const mockFindFirst = vi.fn()
const mockSlotCount = vi.fn()
const mockSlotCreate = vi.fn()
const mockDbTransaction = vi.fn(
  async (fn: (tx: unknown) => Promise<unknown>, _opts?: unknown) =>
    fn({
      freeTierSlot: {
        count: (...args: unknown[]) => mockSlotCount(...args),
        create: (...args: unknown[]) => mockSlotCreate(...args),
      },
    }),
)

vi.mock('@/lib/db', () => ({
  db: {
    generationJob: {
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
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
  createApiUsageEntry,
  attachUsageEntryToGeneration,
  atomicReserveFreeTierSlot,
} from './usage.service'

// ─── Tests ──────────────────────────────────────────────────────

describe('usage.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSlotCreate.mockResolvedValue({ id: 'slot-1' })
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

    it('converts Prisma P2034 serialization failure to FREE_LIMIT_EXCEEDED', async () => {
      mockSlotCount.mockResolvedValue(19)
      const p2034 = Object.assign(
        new Error('Transaction failed due to serialization failure'),
        { code: 'P2034' },
      )
      mockSlotCreate.mockRejectedValue(p2034)

      await expect(atomicReserveFreeTierSlot('user-1')).rejects.toMatchObject({
        code: 'FREE_LIMIT_EXCEEDED',
      })
    })

    it('re-throws non-P2034 errors unchanged', async () => {
      mockSlotCount.mockResolvedValue(19)
      mockSlotCreate.mockRejectedValue(new Error('connection refused'))

      await expect(atomicReserveFreeTierSlot('user-1')).rejects.toThrow(
        'connection refused',
      )
    })
  })
})
