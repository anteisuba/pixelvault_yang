import { describe, it, expect, vi, beforeEach } from 'vitest'

import type { ExecutionCallbackPayload } from '@/types'
import { ApiRequestError } from '@/lib/errors'

// ─── Mocks ──────────────────────────────────────────────────────

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const mockFindUnique = vi.fn()
const mockStreamUploadToR2 = vi.fn()
const mockCreateGeneration = vi.fn()
const mockCompleteGenerationJob = vi.fn()
const mockCreateApiUsageEntry = vi.fn()
const mockFailGenerationJob = vi.fn()

vi.mock('@/lib/db', () => ({
  db: {
    generationJob: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
  },
}))

vi.mock('@/services/storage/r2', () => ({
  generateStorageKey: () => 'generations/user-1/video/test.mp4',
  streamUploadToR2: (...args: unknown[]) => mockStreamUploadToR2(...args),
}))

vi.mock('@/services/generation.service', () => ({
  createGeneration: (...args: unknown[]) => mockCreateGeneration(...args),
}))

vi.mock('@/services/usage.service', () => ({
  completeGenerationJob: (...args: unknown[]) =>
    mockCompleteGenerationJob(...args),
  createApiUsageEntry: (...args: unknown[]) => mockCreateApiUsageEntry(...args),
  failGenerationJob: (...args: unknown[]) => mockFailGenerationJob(...args),
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
    userId: 'user-1',
    status,
    adapterType: 'fal',
    provider: 'fal.ai',
    modelId: 'kling-video',
    prompt: 'cinematic prompt',
    externalRequestId: JSON.stringify({
      referenceImageUrl: 'https://example.com/reference.png',
      characterCardIds: ['card-1'],
      providerMetadata: { requestId: 'request-1' },
    }),
    createdAt: new Date('2026-04-24T00:00:00.000Z'),
  }
}

// ─── Tests ──────────────────────────────────────────────────────

describe('execution-callback.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStreamUploadToR2.mockResolvedValue({
      publicUrl: 'https://cdn.example.com/video.mp4',
      sizeBytes: 1024,
    })
    mockCreateGeneration.mockResolvedValue({
      id: 'generation-1',
      createdAt: new Date('2026-04-24T00:01:00.000Z'),
      outputType: 'VIDEO',
      status: 'COMPLETED',
      url: 'https://cdn.example.com/video.mp4',
      storageKey: 'generations/user-1/video/test.mp4',
      mimeType: 'video/mp4',
      width: 1280,
      height: 720,
      duration: 5,
      prompt: 'cinematic prompt',
      model: 'kling-video',
      provider: 'fal.ai',
      requestCount: 1,
      isPublic: false,
      isPromptPublic: false,
      userId: 'user-1',
    })
    mockCompleteGenerationJob.mockResolvedValue({
      id: 'job-1',
      status: 'COMPLETED',
    })
    mockCreateApiUsageEntry.mockResolvedValue({ id: 'usage-1' })
    mockFailGenerationJob.mockResolvedValue({ id: 'job-1', status: 'FAILED' })
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
      select: {
        id: true,
        userId: true,
        status: true,
        adapterType: true,
        provider: true,
        modelId: true,
        prompt: true,
        externalRequestId: true,
        createdAt: true,
      },
    })
    expect(mockFailGenerationJob).not.toHaveBeenCalled()
  })

  it('logs ping callbacks for a pending job without changing job status', async () => {
    mockFindUnique.mockResolvedValue(buildJob('RUNNING'))

    const result = await handleExecutionCallback(buildPayload('ping'))

    expect(result).toEqual({
      runId: 'job-1',
      jobStatus: 'RUNNING',
      action: 'logged',
    })
    expect(mockCompleteGenerationJob).not.toHaveBeenCalled()
  })

  it('logs status callbacks for a pending job without changing job status', async () => {
    mockFindUnique.mockResolvedValue(buildJob('RUNNING'))

    const result = await handleExecutionCallback(buildPayload('status'))

    expect(result).toEqual({
      runId: 'job-1',
      jobStatus: 'RUNNING',
      action: 'logged',
    })
    expect(mockCompleteGenerationJob).not.toHaveBeenCalled()
  })

  it('finalizes result callbacks for a pending job', async () => {
    mockFindUnique.mockResolvedValue(buildJob('RUNNING'))

    const result = await handleExecutionCallback({
      ...buildPayload('result'),
      data: {
        artifactUrl: 'https://provider.example.com/video.mp4',
        providerMetadata: { requestId: 'request-1' },
        width: 1280,
        height: 720,
        duration: 5,
        requestCount: 1,
      },
    })

    expect(result).toEqual({
      runId: 'job-1',
      jobStatus: 'COMPLETED',
      action: 'completed',
    })
    expect(mockStreamUploadToR2).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceUrl: 'https://provider.example.com/video.mp4',
        key: 'generations/user-1/video/test.mp4',
        mimeType: 'video/mp4',
      }),
    )
    expect(mockCompleteGenerationJob).toHaveBeenCalledWith('job-1', {
      generationId: 'generation-1',
      requestCount: 1,
    })
  })

  it('ignores result callbacks for an already COMPLETED job idempotently', async () => {
    mockFindUnique.mockResolvedValue(buildJob('COMPLETED'))

    const result = await handleExecutionCallback(buildPayload('result'))

    expect(result).toEqual({
      runId: 'job-1',
      jobStatus: 'COMPLETED',
      action: 'ignored-terminal',
    })
    expect(mockStreamUploadToR2).not.toHaveBeenCalled()
  })

  it('ignores result callbacks for an already FAILED job idempotently', async () => {
    mockFindUnique.mockResolvedValue(buildJob('FAILED'))

    const result = await handleExecutionCallback(buildPayload('result'))

    expect(result).toEqual({
      runId: 'job-1',
      jobStatus: 'FAILED',
      action: 'ignored-terminal',
    })
    expect(mockStreamUploadToR2).not.toHaveBeenCalled()
  })

  it('returns 400 VALIDATION_ERROR when result data is missing artifactUrl', async () => {
    mockFindUnique.mockResolvedValue(buildJob('RUNNING'))

    await expect(
      handleExecutionCallback({
        ...buildPayload('result'),
        data: { providerMetadata: { requestId: 'request-1' } },
      }),
    ).rejects.toMatchObject({
      errorCode: 'VALIDATION_ERROR',
      httpStatus: 400,
    })
    expect(mockFailGenerationJob).not.toHaveBeenCalled()
  })

  it('marks the job failed when R2 upload fails', async () => {
    mockFindUnique.mockResolvedValue(buildJob('RUNNING'))
    mockStreamUploadToR2.mockRejectedValue(new Error('R2 upload failed'))

    const result = await handleExecutionCallback({
      ...buildPayload('result'),
      data: {
        artifactUrl: 'https://provider.example.com/video.mp4',
        requestCount: 1,
      },
    })

    expect(result).toEqual({
      runId: 'job-1',
      jobStatus: 'FAILED',
      action: 'failed',
    })
    expect(mockFailGenerationJob).toHaveBeenCalledWith('job-1', {
      requestCount: 1,
      errorMessage: 'R2 upload failed',
    })
  })

  it('stores providerMetadata in the generation snapshot', async () => {
    mockFindUnique.mockResolvedValue(buildJob('RUNNING'))

    await handleExecutionCallback({
      ...buildPayload('result'),
      data: {
        artifactUrl: 'https://provider.example.com/video.mp4',
        providerMetadata: { requestId: 'request-1', seed: 123 },
        width: 1280,
        height: 720,
      },
    })

    expect(mockCreateGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot: expect.objectContaining({
          executionCallback: expect.objectContaining({
            providerMetadata: { requestId: 'request-1', seed: 123 },
          }),
        }),
      }),
    )
  })
})
