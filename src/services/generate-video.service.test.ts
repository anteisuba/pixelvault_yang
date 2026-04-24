import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { AI_MODELS } from '@/constants/models'
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
const mockGenerationJobUpdate = vi.fn()
const mockSubmitVideoToQueue = vi.fn()

vi.mock('@/services/user.service', () => ({
  ensureUser: (...args: unknown[]) => mockEnsureUser(...args),
}))

vi.mock('@/services/generate-image.service', async () => {
  const actual = await vi.importActual<
    typeof import('@/services/generate-image.service')
  >('@/services/generate-image.service')

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

vi.mock('@/lib/prompt-guard', () => ({
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
      'http://127.0.0.1:8787/workflows/cinematic-short-video',
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
      workflowId: WORKFLOW_IDS.CINEMATIC_SHORT_VIDEO,
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

  it('keeps non-CINEMATIC_SHORT_VIDEO requests on the existing inline queue path', async () => {
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
