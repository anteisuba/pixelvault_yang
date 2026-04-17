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
  },
}))

import {
  createGenerationJob,
  completeGenerationJob,
  failGenerationJob,
  createApiUsageEntry,
  attachUsageEntryToGeneration,
} from './usage.service'

// ─── Tests ──────────────────────────────────────────────────────

describe('usage.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
})
