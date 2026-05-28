import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { AI_MODELS } from '@/constants/models'
import { EXECUTION_WORKFLOW_IDS } from '@/constants/execution'
import { WORKFLOW_IDS } from '@/constants/workflows'
import type { GenerateVideoRequest } from '@/types'

// ─── Mocks ──────────────────────────────────────────────────────

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const mockEnsureUser = vi.fn()
const mockResolveGenerationRoute = vi.fn()
const mockGetProviderAdapter = vi.fn()
const mockCreateGenerationJob = vi.fn()
const mockFailGenerationJob = vi.fn()
const mockFetchAsBuffer = vi.fn()
const mockUploadToR2 = vi.fn()
const mockCreateVideoPosterAsset = vi.fn()
const mockGenerationJobUpdate = vi.fn()
const mockSubmitVideoToQueue = vi.fn()

vi.mock('@/services/user.service', () => ({
  ensureUser: (...args: unknown[]) => mockEnsureUser(...args),
}))

vi.mock('@/services/image/generate-image.service', async () => {
  const actual = await vi.importActual<
    typeof import('@/services/image/generate-image.service')
  >('@/services/image/generate-image.service')

  return {
    ...actual,
    resolveGenerationRoute: (...args: unknown[]) =>
      mockResolveGenerationRoute(...args),
  }
})

vi.mock('@/services/providers/registry', () => ({
  getProviderAdapter: (...args: unknown[]) => mockGetProviderAdapter(...args),
}))

vi.mock('@/services/usage.service', () => ({
  createGenerationJob: (...args: unknown[]) => mockCreateGenerationJob(...args),
  failGenerationJob: (...args: unknown[]) => mockFailGenerationJob(...args),
  completeGenerationJob: vi.fn(),
  createApiUsageEntry: vi.fn(),
  attachUsageEntryToGeneration: vi.fn(),
}))

vi.mock('@/services/storage/r2', () => ({
  createVideoPosterAsset: (...args: unknown[]) =>
    mockCreateVideoPosterAsset(...args),
  fetchAsBuffer: (...args: unknown[]) => mockFetchAsBuffer(...args),
  generateStorageKey: () => 'generations/user-1/image/ref.png',
  uploadToR2: (...args: unknown[]) => mockUploadToR2(...args),
  streamUploadToR2: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    generationJob: {
      update: (...args: unknown[]) => mockGenerationJobUpdate(...args),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}))

vi.mock('@/lib/circuit-breaker', () => ({
  getCircuitBreaker: () => ({
    call: (fn: () => Promise<unknown>) => fn(),
  }),
}))

vi.mock('@/lib/with-retry', () => ({
  withRetry: (fn: () => Promise<unknown>) => fn(),
}))

vi.mock('@/services/kernel/prompt-guard', () => ({
  validatePrompt: () => ({ valid: true }),
}))

vi.mock('@/services/video-generation-validation.service', () => ({
  validateVideoGenerationInput: vi.fn(),
}))

import { submitVideoGeneration } from './generate-video.service'

const ORIGINAL_ENV = {
  INTERNAL_CALLBACK_SECRET: process.env.INTERNAL_CALLBACK_SECRET,
  EXECUTION_WORKER_BASE_URL: process.env.EXECUTION_WORKER_BASE_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
}

function buildVideoRequest(
  overrides: Partial<GenerateVideoRequest> = {},
): GenerateVideoRequest {
  return {
    prompt: 'cinematic camera move over a neon city',
    modelId: AI_MODELS.KLING_VIDEO,
    aspectRatio: '16:9',
    duration: 5,
    apiKeyId: 'key-1',
    workflowId: WORKFLOW_IDS.CINEMATIC_SHORT_VIDEO,
    ...overrides,
  }
}

describe('generate-video.service worker dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.INTERNAL_CALLBACK_SECRET = 'test-internal-callback-secret'
    process.env.EXECUTION_WORKER_BASE_URL = 'http://127.0.0.1:8787'
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'

    mockEnsureUser.mockResolvedValue({ id: 'user-1' })
    mockResolveGenerationRoute.mockResolvedValue({
      modelId: AI_MODELS.KLING_VIDEO,
      adapterType: 'fal',
      providerConfig: { label: 'fal.ai', baseUrl: 'https://fal.run' },
      apiKey: 'plain-key',
      resolvedApiKeyId: 'key-1',
      isFreeGeneration: false,
      creditCost: 5,
    })
    mockGetProviderAdapter.mockReturnValue({
      submitVideoToQueue: mockSubmitVideoToQueue,
      checkVideoQueueStatus: vi.fn(),
    })
    mockCreateGenerationJob.mockResolvedValue({
      id: 'job-1',
      status: 'RUNNING',
    })
    mockGenerationJobUpdate.mockResolvedValue({ id: 'job-1' })
    mockFailGenerationJob.mockResolvedValue({ id: 'job-1', status: 'FAILED' })
    mockFetchAsBuffer.mockResolvedValue({
      buffer: Buffer.from('reference'),
      mimeType: 'image/png',
    })
    mockUploadToR2.mockResolvedValue('https://cdn.example.com/ref.png')
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(Response.json({ workflowInstanceId: 'wf-job-1' })),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()

    Object.entries(ORIGINAL_ENV).forEach(([key, value]) => {
      if (value === undefined) {
        delete process.env[key]
        return
      }

      process.env[key] = value
    })
  })

  it('dispatches CINEMATIC_SHORT_VIDEO runs to the execution worker without inline provider submit', async () => {
    const result = await submitVideoGeneration(
      'clerk-1',
      buildVideoRequest({ referenceImage: 'data:image/png;base64,cmVm' }),
    )

    expect(result).toEqual({ jobId: 'job-1', requestId: 'wf-job-1' })
    expect(mockSubmitVideoToQueue).not.toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8787/workflows/fal-queue',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-Execution-Signature': expect.any(String),
        }),
      }),
    )

    const dispatchBody = JSON.parse(
      (vi.mocked(fetch).mock.calls[0][1] as { body: string }).body,
    ) as Record<string, unknown>

    expect(dispatchBody).toMatchObject({
      runId: 'job-1',
      workflowId: EXECUTION_WORKFLOW_IDS.FAL_QUEUE,
      outputType: 'VIDEO',
      apiKeyId: 'key-1',
      callbackUrl: 'http://localhost:3000/api/internal/execution/callback',
      resolveKeyUrl: 'http://localhost:3000/api/internal/execution/resolve-key',
    })
    expect(dispatchBody).not.toHaveProperty('apiKey')
    expect(mockGenerationJobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job-1' },
      }),
    )
  })

  it('dispatches ordinary FAL video runs to the execution worker', async () => {
    const result = await submitVideoGeneration(
      'clerk-1',
      buildVideoRequest({ workflowId: WORKFLOW_IDS.CHARACTER_TO_VIDEO }),
    )

    expect(result).toEqual({ jobId: 'job-1', requestId: 'wf-job-1' })
    expect(mockSubmitVideoToQueue).not.toHaveBeenCalled()
    expect(fetch).toHaveBeenCalled()
  })

  it('falls back to the inline queue path when the execution worker URL is not configured', async () => {
    delete process.env.EXECUTION_WORKER_BASE_URL
    mockSubmitVideoToQueue.mockResolvedValue({
      requestId: 'provider-request-1',
      statusUrl: 'https://queue.fal.run/status',
      responseUrl: 'https://queue.fal.run/response',
    })

    const result = await submitVideoGeneration('clerk-1', buildVideoRequest())

    expect(result).toEqual({
      jobId: 'job-1',
      requestId: 'provider-request-1',
    })
    expect(mockSubmitVideoToQueue).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'cinematic camera move over a neon city',
        modelId: AI_MODELS.KLING_VIDEO,
        apiKey: 'plain-key',
      }),
    )
    expect(fetch).not.toHaveBeenCalled()
  })

  it('forwards videoUrls to the worker dispatch providerInput for Seedance Reference', async () => {
    mockResolveGenerationRoute.mockResolvedValueOnce({
      modelId: AI_MODELS.SEEDANCE_20_FAST_REFERENCE,
      adapterType: 'fal',
      providerConfig: { label: 'fal.ai', baseUrl: 'https://fal.run' },
      apiKey: 'plain-key',
      resolvedApiKeyId: 'key-1',
      isFreeGeneration: false,
      creditCost: 4,
    })

    await submitVideoGeneration(
      'clerk-1',
      buildVideoRequest({
        modelId: AI_MODELS.SEEDANCE_20_FAST_REFERENCE,
        workflowId: WORKFLOW_IDS.CHARACTER_TO_VIDEO,
        referenceImage: 'data:image/png;base64,cmVm',
        videoUrls: [
          'https://cdn.example.com/clip-a.mp4',
          'https://cdn.example.com/clip-b.mp4',
        ],
        audioUrls: ['https://cdn.example.com/voice.mp3'],
      }),
    )

    expect(fetch).toHaveBeenCalled()
    const dispatchBody = JSON.parse(
      (vi.mocked(fetch).mock.calls[0][1] as { body: string }).body,
    ) as { providerInput: Record<string, unknown> }

    expect(dispatchBody.providerInput).toMatchObject({
      videoUrls: [
        'https://cdn.example.com/clip-a.mp4',
        'https://cdn.example.com/clip-b.mp4',
      ],
      audioUrls: ['https://cdn.example.com/voice.mp3'],
    })
  })

  it('omits videoUrls from the worker dispatch when none are supplied', async () => {
    mockResolveGenerationRoute.mockResolvedValueOnce({
      modelId: AI_MODELS.SEEDANCE_20_FAST_REFERENCE,
      adapterType: 'fal',
      providerConfig: { label: 'fal.ai', baseUrl: 'https://fal.run' },
      apiKey: 'plain-key',
      resolvedApiKeyId: 'key-1',
      isFreeGeneration: false,
      creditCost: 4,
    })

    await submitVideoGeneration(
      'clerk-1',
      buildVideoRequest({
        modelId: AI_MODELS.SEEDANCE_20_FAST_REFERENCE,
        workflowId: WORKFLOW_IDS.CHARACTER_TO_VIDEO,
        referenceImage: 'data:image/png;base64,cmVm',
      }),
    )

    const dispatchBody = JSON.parse(
      (vi.mocked(fetch).mock.calls[0][1] as { body: string }).body,
    ) as { providerInput: Record<string, unknown> }

    expect(dispatchBody.providerInput.videoUrls).toBeUndefined()
  })

  it('forwards videoUrls through the inline fal adapter path when the worker URL is absent', async () => {
    delete process.env.EXECUTION_WORKER_BASE_URL
    mockResolveGenerationRoute.mockResolvedValueOnce({
      modelId: AI_MODELS.SEEDANCE_20_FAST_REFERENCE,
      adapterType: 'fal',
      providerConfig: { label: 'fal.ai', baseUrl: 'https://fal.run' },
      apiKey: 'plain-key',
      resolvedApiKeyId: null,
      isFreeGeneration: false,
      creditCost: 4,
    })
    mockSubmitVideoToQueue.mockResolvedValue({
      requestId: 'provider-request-1',
      statusUrl: 'https://queue.fal.run/status',
      responseUrl: 'https://queue.fal.run/response',
    })

    await submitVideoGeneration(
      'clerk-1',
      buildVideoRequest({
        modelId: AI_MODELS.SEEDANCE_20_FAST_REFERENCE,
        referenceImage: 'data:image/png;base64,cmVm',
        videoUrls: ['https://cdn.example.com/clip-a.mp4'],
      }),
    )

    expect(mockSubmitVideoToQueue).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: AI_MODELS.SEEDANCE_20_FAST_REFERENCE,
        videoUrls: ['https://cdn.example.com/clip-a.mp4'],
      }),
    )
  })

  it('keeps routes without worker-resolvable keys on the existing inline queue path', async () => {
    mockResolveGenerationRoute.mockResolvedValueOnce({
      modelId: AI_MODELS.KLING_VIDEO,
      adapterType: 'fal',
      providerConfig: { label: 'fal.ai', baseUrl: 'https://fal.run' },
      apiKey: 'plain-key',
      resolvedApiKeyId: null,
      isFreeGeneration: false,
      creditCost: 5,
    })
    mockSubmitVideoToQueue.mockResolvedValue({
      requestId: 'provider-request-1',
      statusUrl: 'https://queue.fal.run/status',
      responseUrl: 'https://queue.fal.run/response',
    })

    const result = await submitVideoGeneration(
      'clerk-1',
      buildVideoRequest({ workflowId: WORKFLOW_IDS.CHARACTER_TO_VIDEO }),
    )

    expect(result).toEqual({
      jobId: 'job-1',
      requestId: 'provider-request-1',
    })
    expect(mockSubmitVideoToQueue).toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })
})
