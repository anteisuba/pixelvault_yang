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
    uploadReferenceImageIfNeeded: vi.fn(),
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
  generateImageForUser,
  resolveImageRouteAndValidate,
  uploadReferenceImageIfNeeded,
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
  vi.mocked(uploadReferenceImageIfNeeded).mockResolvedValue(undefined)
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
    expect(generateImageForUser).not.toHaveBeenCalled()
    // job created RUNNING, then patched with the workflow instance id
    expect(createGenerationJob).toHaveBeenCalledTimes(1)
    expect(db.generationJob.update).toHaveBeenCalledTimes(1)
  })

  it('falls back to synchronous generation when dispatch is not configured', async () => {
    setupResolve(AI_ADAPTER_TYPES.OPENAI)
    vi.mocked(isExecutionWorkerDispatchConfigured).mockReturnValue(false)
    vi.mocked(generateImageForUser).mockResolvedValue({ id: 'gen-1' } as never)

    const result = await submitImageGeneration('clerk-1', INPUT)

    expect(result).toEqual({ generation: { id: 'gen-1' } })
    expect(generateImageForUser).toHaveBeenCalledTimes(1)
    expect(dispatchImageWorkerRun).not.toHaveBeenCalled()
    expect(createGenerationJob).not.toHaveBeenCalled()
  })

  it('falls back to synchronous generation when adapter is not migrated', async () => {
    setupResolve(AI_ADAPTER_TYPES.GEMINI)
    vi.mocked(isExecutionWorkerDispatchConfigured).mockReturnValue(true)
    vi.mocked(generateImageForUser).mockResolvedValue({ id: 'gen-1' } as never)

    const result = await submitImageGeneration('clerk-1', INPUT)

    expect(result).toEqual({ generation: { id: 'gen-1' } })
    expect(generateImageForUser).toHaveBeenCalledTimes(1)
    expect(dispatchImageWorkerRun).not.toHaveBeenCalled()
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

  it('falls back to synchronous generation for image-to-image requests', async () => {
    setupResolve(AI_ADAPTER_TYPES.OPENAI)
    vi.mocked(isExecutionWorkerDispatchConfigured).mockReturnValue(true)
    vi.mocked(generateImageForUser).mockResolvedValue({ id: 'gen-1' } as never)

    const result = await submitImageGeneration('clerk-1', {
      ...INPUT,
      referenceImages: ['https://cdn.example.com/ref.png'],
    })

    expect(result).toEqual({ generation: { id: 'gen-1' } })
    expect(generateImageForUser).toHaveBeenCalledTimes(1)
    expect(dispatchImageWorkerRun).not.toHaveBeenCalled()
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
    } as never)

    const result = await checkImageGenerationStatus('clerk-1', 'job-1')

    expect(result).toEqual({ jobId: 'job-1', status: 'FAILED' })
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
