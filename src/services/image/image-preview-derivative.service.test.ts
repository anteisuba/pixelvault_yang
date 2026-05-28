import { beforeEach, describe, expect, it, vi } from 'vitest'

import { EXECUTION_OUTBOX_KINDS } from '@/constants/execution'

const {
  mockExecutionOutboxCreate,
  mockExecutionOutboxFindUnique,
  mockExecutionOutboxFindMany,
  mockExecutionOutboxUpdate,
  mockExecutionOutboxUpdateMany,
  mockGenerationFindUnique,
  mockGenerationUpdate,
  mockTransaction,
  mockFetchAsBuffer,
  mockCreateImagePreviewAssets,
} = vi.hoisted(() => ({
  mockExecutionOutboxCreate: vi.fn(),
  mockExecutionOutboxFindUnique: vi.fn(),
  mockExecutionOutboxFindMany: vi.fn(),
  mockExecutionOutboxUpdate: vi.fn(),
  mockExecutionOutboxUpdateMany: vi.fn(),
  mockGenerationFindUnique: vi.fn(),
  mockGenerationUpdate: vi.fn(),
  mockTransaction: vi.fn(),
  mockFetchAsBuffer: vi.fn(),
  mockCreateImagePreviewAssets: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    executionOutbox: {
      create: mockExecutionOutboxCreate,
      findUnique: mockExecutionOutboxFindUnique,
      findMany: mockExecutionOutboxFindMany,
      update: mockExecutionOutboxUpdate,
      updateMany: mockExecutionOutboxUpdateMany,
    },
    generation: {
      findUnique: mockGenerationFindUnique,
      update: mockGenerationUpdate,
    },
    $transaction: mockTransaction,
  },
}))

vi.mock('@/services/storage/r2', () => ({
  fetchAsBuffer: mockFetchAsBuffer,
  createImagePreviewAssets: mockCreateImagePreviewAssets,
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import {
  enqueueImagePreviewDerivatives,
  processImagePreviewDerivativeOutbox,
  processPendingImagePreviewDerivativeOutboxes,
} from '@/services/image/image-preview-derivative.service'

function buildOutbox() {
  return {
    id: 'outbox-1',
    generationJobId: 'job-1',
    kind: EXECUTION_OUTBOX_KINDS.IMAGE_PREVIEW_DERIVATIVES,
    status: 'PENDING',
    payload: {
      generationId: 'gen-1',
      sourceUrl: 'https://cdn.example.com/source.png',
      sourceStorageKey: 'generations/user-1/image/source.png',
    },
    result: null,
    attemptCount: 0,
    lastError: null,
    leaseExpiresAt: null,
    processedAt: null,
    createdAt: new Date('2026-05-16T00:00:00.000Z'),
    updatedAt: new Date('2026-05-16T00:00:00.000Z'),
  }
}

describe('image-preview-derivative.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTransaction.mockImplementation(async (fn) =>
      fn({
        generation: { update: mockGenerationUpdate },
        executionOutbox: { update: mockExecutionOutboxUpdate },
      }),
    )
    mockFetchAsBuffer.mockResolvedValue({
      buffer: Buffer.from('source-image'),
      mimeType: 'image/png',
    })
    mockCreateImagePreviewAssets.mockResolvedValue({
      thumbnailUrl: 'https://cdn.example.com/source.thumbnail.webp',
      thumbnailStorageKey: 'generations/user-1/image/source.thumbnail.webp',
      previewUrl: 'https://cdn.example.com/source.preview.webp',
      previewStorageKey: 'generations/user-1/image/source.preview.webp',
    })
    mockExecutionOutboxUpdate.mockResolvedValue({ id: 'outbox-1' })
  })

  it('enqueues image preview derivative work in the execution outbox', async () => {
    mockExecutionOutboxCreate.mockResolvedValue({ id: 'outbox-1' })

    await enqueueImagePreviewDerivatives({
      generationJobId: 'job-1',
      generationId: 'gen-1',
      sourceUrl: 'https://cdn.example.com/source.png',
      sourceStorageKey: 'generations/user-1/image/source.png',
    })

    expect(mockExecutionOutboxCreate).toHaveBeenCalledWith({
      data: {
        generationJobId: 'job-1',
        kind: EXECUTION_OUTBOX_KINDS.IMAGE_PREVIEW_DERIVATIVES,
        payload: {
          generationId: 'gen-1',
          sourceUrl: 'https://cdn.example.com/source.png',
          sourceStorageKey: 'generations/user-1/image/source.png',
        },
      },
    })
  })

  it('processes a pending derivative outbox and updates generation preview fields', async () => {
    mockExecutionOutboxFindUnique.mockResolvedValue(buildOutbox())
    mockExecutionOutboxUpdateMany.mockResolvedValue({ count: 1 })
    mockGenerationFindUnique.mockResolvedValue({
      id: 'gen-1',
      outputType: 'IMAGE',
      thumbnailUrl: null,
      previewUrl: null,
    })

    const result = await processImagePreviewDerivativeOutbox('outbox-1')

    expect(result).toEqual({
      outboxId: 'outbox-1',
      status: 'completed',
      generationId: 'gen-1',
    })
    expect(mockFetchAsBuffer).toHaveBeenCalledWith(
      'https://cdn.example.com/source.png',
      { maxBytes: 40 * 1024 * 1024 },
    )
    expect(mockCreateImagePreviewAssets).toHaveBeenCalledWith({
      sourceBuffer: Buffer.from('source-image'),
      sourceStorageKey: 'generations/user-1/image/source.png',
    })
    expect(mockGenerationUpdate).toHaveBeenCalledWith({
      where: { id: 'gen-1' },
      data: {
        thumbnailUrl: 'https://cdn.example.com/source.thumbnail.webp',
        thumbnailStorageKey: 'generations/user-1/image/source.thumbnail.webp',
        previewUrl: 'https://cdn.example.com/source.preview.webp',
        previewStorageKey: 'generations/user-1/image/source.preview.webp',
      },
    })
    expect(mockExecutionOutboxUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'outbox-1' },
        data: expect.objectContaining({ status: 'COMPLETED' }),
      }),
    )
  })

  it('processes pending derivative outboxes in created order', async () => {
    mockExecutionOutboxFindMany.mockResolvedValue([
      { id: 'outbox-1' },
      { id: 'outbox-2' },
    ])
    mockExecutionOutboxFindUnique
      .mockResolvedValueOnce(buildOutbox())
      .mockResolvedValueOnce({
        ...buildOutbox(),
        id: 'outbox-2',
        payload: {
          generationId: 'gen-2',
          sourceUrl: 'https://cdn.example.com/source-2.png',
          sourceStorageKey: 'generations/user-1/image/source-2.png',
        },
      })
    mockExecutionOutboxUpdateMany.mockResolvedValue({ count: 1 })
    mockGenerationFindUnique
      .mockResolvedValueOnce({
        id: 'gen-1',
        outputType: 'IMAGE',
        thumbnailUrl: null,
        previewUrl: null,
      })
      .mockResolvedValueOnce({
        id: 'gen-2',
        outputType: 'IMAGE',
        thumbnailUrl: null,
        previewUrl: null,
      })

    const results = await processPendingImagePreviewDerivativeOutboxes({
      limit: 2,
    })

    expect(results).toHaveLength(2)
    expect(mockExecutionOutboxFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          kind: EXECUTION_OUTBOX_KINDS.IMAGE_PREVIEW_DERIVATIVES,
        }),
        orderBy: { createdAt: 'asc' },
        take: 2,
      }),
    )
  })
})
