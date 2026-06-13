import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { GenerateRequest } from '@/types'

// ─── Mocks ─────────────────────────────────────────────────────

vi.mock('@/lib/db', () => ({
  db: {
    generationJob: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))
vi.mock('@/services/execution-worker.service', () => ({
  isExecutionWorkerDispatchConfigured: vi.fn(),
  dispatchImageWorkerRun: vi.fn(),
  buildInternalUrl: (path: string) => `https://app.example.com${path}`,
}))
// Provide a real-enough error class without importing the full module (and its
// heavy dependency graph). Only the shared helpers are stubbed.
vi.mock('@/services/image/generate-image.service', () => {
  class GenerateImageServiceError extends Error {
    readonly code: string
    readonly status: number
    constructor(code: string, message: string, status: number) {
      super(message)
      this.code = code
      this.status = status
      this.name = 'GenerateImageServiceError'
    }
  }
  return {
    GenerateImageServiceError,
    resolveImageRouteAndValidate: vi.fn(),
    generateImageForUser: vi.fn(),
    uploadReferenceImagesIfNeeded: vi.fn(),
  }
})
vi.mock('@/services/generation.service', () => ({
  getGenerationByIdForUser: vi.fn(),
}))
vi.mock('@/services/usage.service', () => ({
  createGenerationJob: vi.fn(),
  failGenerationJob: vi.fn(),
}))
vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn(),
}))
vi.mock('@/services/storage/r2', () => ({
  generateStorageKey: vi.fn(() => 'generations/user-1/image/output.png'),
}))
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { db } from '@/lib/db'
import {
  dispatchImageWorkerRun,
  isExecutionWorkerDispatchConfigured,
} from '@/services/execution-worker.service'
import {
  GenerateImageServiceError,
  resolveImageRouteAndValidate,
  uploadReferenceImagesIfNeeded,
} from '@/services/image/generate-image.service'
import { getGenerationByIdForUser } from '@/services/generation.service'
import {
  createGenerationJob,
  failGenerationJob,
} from '@/services/usage.service'
import { ensureUser } from '@/services/user.service'
import {
  checkImageGenerationStatus,
  submitImageGeneration,
  waitForImageGenerationResult,
} from '@/services/image/submit-image.service'

// ─── Fixtures ──────────────────────────────────────────────────

const INPUT: GenerateRequest = {
  prompt: 'A red circle',
  modelId: 'gpt-image-2',
  aspectRatio: '1:1',
}

function routeFor(adapterType: AI_ADAPTER_TYPES) {
  return {
    modelId: 'gpt-image-2',
    adapterType,
    providerConfig: { label: 'OpenAI', baseUrl: 'https://api.openai.com' },
    creditCost: 1,
    isFreeGeneration: true,
    resolvedApiKeyId: null,
  }
}

function setupResolve(adapterType: AI_ADAPTER_TYPES) {
  vi.mocked(resolveImageRouteAndValidate).mockResolvedValue({
    dbUser: { id: 'user-1' } as never,
    route: routeFor(adapterType) as never,
    provider: 'OpenAI',
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(uploadReferenceImagesIfNeeded).mockResolvedValue([])
  vi.mocked(createGenerationJob).mockResolvedValue({ id: 'job-1' } as never)
  vi.mocked(dispatchImageWorkerRun).mockResolvedValue({
    workflowInstanceId: 'wf-1',
  })
  vi.mocked(db.generationJob.update).mockResolvedValue({} as never)
  vi.mocked(ensureUser).mockResolvedValue({ id: 'user-1' } as never)
})

// ─── submitImageGeneration ─────────────────────────────────────

describe('submitImageGeneration', () => {
  it('dispatches to the worker when adapter is migrated and dispatch is configured', async () => {
    setupResolve(AI_ADAPTER_TYPES.OPENAI)
    vi.mocked(isExecutionWorkerDispatchConfigured).mockReturnValue(true)

    const result = await submitImageGeneration('clerk-1', INPUT)

    expect(result).toEqual({ jobId: 'job-1', requestId: 'wf-1' })
    expect(dispatchImageWorkerRun).toHaveBeenCalledTimes(1)
    // job created RUNNING, then patched with the workflow instance id
    expect(createGenerationJob).toHaveBeenCalledTimes(1)
    expect(db.generationJob.update).toHaveBeenCalledTimes(1)
  })

  it('dispatches FAL text-to-image to the worker with a final R2 key', async () => {
    setupResolve(AI_ADAPTER_TYPES.FAL)
    vi.mocked(isExecutionWorkerDispatchConfigured).mockReturnValue(true)

    const result = await submitImageGeneration('clerk-1', {
      ...INPUT,
      modelId: 'flux-2-pro',
    })

    expect(result).toEqual({ jobId: 'job-1', requestId: 'wf-1' })
    expect(dispatchImageWorkerRun).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: AI_ADAPTER_TYPES.FAL,
        maxAttempts: 200,
        providerInput: expect.objectContaining({
          modelId: 'gpt-image-2',
          outputStorageKey: 'generations/user-1/image/output.png',
        }),
      }),
    )
  })

  it('fails when dispatch is not configured', async () => {
    setupResolve(AI_ADAPTER_TYPES.OPENAI)
    vi.mocked(isExecutionWorkerDispatchConfigured).mockReturnValue(false)

    await expect(submitImageGeneration('clerk-1', INPUT)).rejects.toMatchObject(
      {
        code: 'PROVIDER_ERROR',
        status: 503,
      },
    )
    expect(dispatchImageWorkerRun).not.toHaveBeenCalled()
    expect(createGenerationJob).not.toHaveBeenCalled()
  })

  it('dispatches migrated non-OpenAI image adapters to the worker', async () => {
    setupResolve(AI_ADAPTER_TYPES.GEMINI)
    vi.mocked(isExecutionWorkerDispatchConfigured).mockReturnValue(true)

    const result = await submitImageGeneration('clerk-1', INPUT)

    expect(result).toEqual({ jobId: 'job-1', requestId: 'wf-1' })
    expect(dispatchImageWorkerRun).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: AI_ADAPTER_TYPES.GEMINI,
        maxAttempts: 1,
        providerInput: expect.objectContaining({
          outputStorageKey: 'generations/user-1/image/output.png',
        }),
      }),
    )
  })

  it('fails the job and rethrows when dispatch errors', async () => {
    setupResolve(AI_ADAPTER_TYPES.OPENAI)
    vi.mocked(isExecutionWorkerDispatchConfigured).mockReturnValue(true)
    vi.mocked(dispatchImageWorkerRun).mockRejectedValue(
      new Error('worker unreachable'),
    )

    await expect(submitImageGeneration('clerk-1', INPUT)).rejects.toThrow(
      'worker unreachable',
    )
    expect(failGenerationJob).toHaveBeenCalledWith('job-1', {
      errorMessage: 'worker unreachable',
    })
  })

  it('dispatches reference-image requests with stable uploaded references', async () => {
    setupResolve(AI_ADAPTER_TYPES.OPENAI)
    vi.mocked(isExecutionWorkerDispatchConfigured).mockReturnValue(true)
    vi.mocked(uploadReferenceImagesIfNeeded).mockResolvedValue([
      'https://cdn.example.com/stable-ref.png',
    ])

    await submitImageGeneration('clerk-1', {
      ...INPUT,
      referenceImages: ['data:image/png;base64,cmVm'],
    })

    expect(uploadReferenceImagesIfNeeded).toHaveBeenCalledTimes(1)
    expect(createGenerationJob).toHaveBeenCalledWith(
      expect.objectContaining({
        externalRequestId: expect.stringContaining(
          'https://cdn.example.com/stable-ref.png',
        ),
      }),
    )
    expect(dispatchImageWorkerRun).toHaveBeenCalledWith(
      expect.objectContaining({
        providerInput: expect.objectContaining({
          referenceImage: 'https://cdn.example.com/stable-ref.png',
          referenceImages: ['https://cdn.example.com/stable-ref.png'],
        }),
      }),
    )
  })

  it('persists multi-view batch metadata for status aggregation', async () => {
    setupResolve(AI_ADAPTER_TYPES.FAL)
    vi.mocked(isExecutionWorkerDispatchConfigured).mockReturnValue(true)

    await submitImageGeneration(
      'clerk-1',
      INPUT,
      {},
      {
        multiViewBatchId: 'batch-1',
        multiViewAngle: 'back',
        sourceGenerationId: 'source-gen-1',
      },
    )

    const createInput = vi.mocked(createGenerationJob).mock.calls[0][0]
    expect(JSON.parse(createInput.externalRequestId ?? '{}')).toMatchObject({
      outputType: 'IMAGE',
      multiViewBatchId: 'batch-1',
      multiViewAngle: 'back',
      sourceGenerationId: 'source-gen-1',
    })
  })
})

// ─── checkImageGenerationStatus ────────────────────────────────

describe('checkImageGenerationStatus', () => {
  it('returns COMPLETED with the generation', async () => {
    vi.mocked(db.generationJob.findUnique).mockResolvedValue({
      id: 'job-1',
      userId: 'user-1',
      status: 'COMPLETED',
      generationId: 'gen-1',
    } as never)
    vi.mocked(getGenerationByIdForUser).mockResolvedValue({
      id: 'gen-1',
    } as never)

    const result = await checkImageGenerationStatus('clerk-1', 'job-1')

    expect(result).toEqual({
      jobId: 'job-1',
      status: 'COMPLETED',
      generation: { id: 'gen-1' },
    })
  })

  it('returns FAILED for a failed job', async () => {
    vi.mocked(db.generationJob.findUnique).mockResolvedValue({
      id: 'job-1',
      userId: 'user-1',
      status: 'FAILED',
      generationId: null,
      errorMessage:
        'Replicate image generation failed: Checkpoint not supported',
    } as never)

    const result = await checkImageGenerationStatus('clerk-1', 'job-1')

    expect(result).toEqual({
      jobId: 'job-1',
      status: 'FAILED',
      error: 'Replicate image generation failed: Checkpoint not supported',
    })
  })

  it('preserves the failed job error when server-side wait resolves failure', async () => {
    vi.mocked(db.generationJob.findUnique).mockResolvedValue({
      id: 'job-1',
      userId: 'user-1',
      status: 'FAILED',
      generationId: null,
      errorMessage: 'Provider rejected the reference image',
    } as never)

    await expect(
      waitForImageGenerationResult('clerk-1', 'job-1'),
    ).rejects.toMatchObject({
      message: 'Provider rejected the reference image',
    })
  })

  it('returns IN_PROGRESS for a running job', async () => {
    vi.mocked(db.generationJob.findUnique).mockResolvedValue({
      id: 'job-1',
      userId: 'user-1',
      status: 'RUNNING',
      generationId: null,
    } as never)

    const result = await checkImageGenerationStatus('clerk-1', 'job-1')

    expect(result).toEqual({ jobId: 'job-1', status: 'IN_PROGRESS' })
  })

  it('throws JOB_NOT_FOUND when the job belongs to another user', async () => {
    vi.mocked(db.generationJob.findUnique).mockResolvedValue({
      id: 'job-1',
      userId: 'someone-else',
      status: 'COMPLETED',
      generationId: 'gen-1',
    } as never)

    await expect(
      checkImageGenerationStatus('clerk-1', 'job-1'),
    ).rejects.toThrow(GenerateImageServiceError)
  })
})
