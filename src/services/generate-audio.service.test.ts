import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Mock all external dependencies ────────────────────────────

const mockGenerationJobFindUnique = vi.fn()
const mockGenerationJobUpdate = vi.fn()
const mockGenerationJobUpdateMany = vi.fn()
const mockTransaction = vi.fn(
  async (callback: (tx: object) => Promise<unknown>) => callback({}),
)

vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn(),
}))
vi.mock('@/services/apiKey.service', () => ({
  getApiKeyValueById: vi.fn(),
}))
vi.mock('@/services/generate-image.service', () => ({
  resolveGenerationRoute: vi.fn(),
  GenerateImageServiceError: class GenerateImageServiceError extends Error {
    code: string
    status: number

    constructor(code: string, message: string, status: number) {
      super(message)
      this.code = code
      this.status = status
      this.name = 'GenerateImageServiceError'
    }
  },
}))
vi.mock('@/services/execution-outbox.service', () => ({
  createExecutionOutbox: vi.fn(),
  tryClaimExecutionOutbox: vi.fn(),
  completeExecutionOutbox: vi.fn(),
  failExecutionOutbox: vi.fn(),
  failExpiredExecutionOutbox: vi.fn(),
  annotateExecutionOutbox: vi.fn(),
}))
vi.mock('@/services/providers/registry', () => ({
  getProviderAdapter: vi.fn(),
}))
vi.mock('@/services/generation.service', () => ({
  createGeneration: vi.fn(),
}))
vi.mock('@/services/storage/r2', () => ({
  fetchAsBuffer: vi.fn(),
  generateStorageKey: vi.fn(),
  uploadToR2: vi.fn(),
}))
vi.mock('@/services/usage.service', () => ({
  createApiUsageEntry: vi.fn(),
  createGenerationJob: vi.fn(),
  completeGenerationJob: vi.fn(),
  failGenerationJob: vi.fn(),
  attachUsageEntryToGeneration: vi.fn(),
}))
vi.mock('@/lib/db', () => ({
  db: {
    $transaction: (callback: (tx: object) => Promise<unknown>) =>
      mockTransaction(callback),
    generationJob: {
      findUnique: (...args: unknown[]) => mockGenerationJobFindUnique(...args),
      update: (...args: unknown[]) => mockGenerationJobUpdate(...args),
      updateMany: (...args: unknown[]) => mockGenerationJobUpdateMany(...args),
    },
  },
}))
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
vi.mock('@/lib/with-retry', () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}))
vi.mock('@/lib/circuit-breaker', () => ({
  getCircuitBreaker: vi.fn(() => ({
    call: (fn: () => Promise<unknown>) => fn(),
  })),
}))
vi.mock('@/lib/platform-keys', () => ({
  getSystemApiKey: vi.fn(),
}))
vi.mock('@/constants/providers', async () => {
  const actual = await vi.importActual<typeof import('@/constants/providers')>(
    '@/constants/providers',
  )
  return {
    ...actual,
    getProviderLabel: vi.fn(
      (config: { label?: string }) => config.label ?? 'Unknown',
    ),
  }
})

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { EXECUTION_OUTBOX_KINDS } from '@/constants/execution'
import type { GenerateAudioRequest } from '@/types'
import {
  checkAudioGenerationStatus,
  generateAudioForUser,
  submitAudioGeneration,
} from '@/services/generate-audio.service'
import { getApiKeyValueById } from '@/services/apiKey.service'
import { resolveGenerationRoute } from '@/services/generate-image.service'
import { ensureUser } from '@/services/user.service'
import { getProviderAdapter } from '@/services/providers/registry'
import { createGeneration } from '@/services/generation.service'
import {
  annotateExecutionOutbox,
  completeExecutionOutbox,
  createExecutionOutbox,
  failExecutionOutbox,
  failExpiredExecutionOutbox,
  tryClaimExecutionOutbox,
} from '@/services/execution-outbox.service'
import {
  fetchAsBuffer,
  generateStorageKey,
  uploadToR2,
} from '@/services/storage/r2'
import {
  createApiUsageEntry,
  createGenerationJob,
  completeGenerationJob,
  failGenerationJob,
} from '@/services/usage.service'
import { getSystemApiKey } from '@/lib/platform-keys'
import { ProviderError } from '@/services/providers/types'

// ─── Fixtures ──────────────────────────────────────────────────

const FAKE_USER = { id: 'user-1', clerkId: 'clerk-1', credits: 100 }
const FAKE_SYNC_JOB = { id: 'job-sync-1' }
const FAKE_ASYNC_JOB = {
  id: 'job-async-1',
  userId: 'user-1',
  status: 'RUNNING',
  modelId: 'fal-f5-tts',
  adapterType: AI_ADAPTER_TYPES.FAL,
  provider: 'FAL',
  prompt: 'Hello world',
  externalRequestId: JSON.stringify({
    requestId: 'req-1',
    statusUrl: 'https://fal.example.com/status',
    responseUrl: 'https://fal.example.com/result',
    route: {
      modelId: 'fal-f5-tts',
      adapterType: AI_ADAPTER_TYPES.FAL,
      provider: 'FAL',
      providerConfig: {
        label: 'FAL',
        baseUrl: 'https://queue.fal.run',
      },
      apiKeyId: 'key-1',
      isFreeGeneration: false,
    },
  }),
  createdAt: new Date('2026-04-23T00:00:00.000Z'),
  generation: null,
  executionOutbox: {
    id: 'outbox-audio-1',
    status: 'PENDING' as const,
    payload: {
      prompt: 'Hello world',
      voiceId: undefined,
      speed: undefined,
      format: undefined,
      sampleRate: undefined,
    },
    result: null,
    leaseExpiresAt: null,
    lastError: null,
  },
}
const FAKE_USAGE = { id: 'usage-1' }
const FAKE_GENERATION = {
  id: 'gen-1',
  createdAt: new Date('2026-04-23T00:00:01.000Z'),
  outputType: 'AUDIO' as const,
  status: 'COMPLETED' as const,
  url: 'https://cdn.example.com/audio.mp3',
  storageKey: 'audio/user-1/gen.mp3',
  mimeType: 'audio/mpeg',
  width: 0,
  height: 0,
  duration: 3.5,
  prompt: 'Hello world',
  negativePrompt: null,
  model: 'fish-audio-s2-pro',
  provider: 'Fish Audio',
  requestCount: 1,
  isPublic: false,
  isPromptPublic: false,
  userId: 'user-1',
}
const FAKE_SYNC_ROUTE = {
  modelId: 'fish-audio-s2-pro',
  adapterType: AI_ADAPTER_TYPES.FISH_AUDIO,
  providerConfig: { label: 'Fish Audio', baseUrl: 'https://api.fish.audio' },
  apiKey: 'test-key-123',
  resolvedApiKeyId: 'sync-key-1',
  creditCost: 1,
}
const FAKE_ASYNC_ROUTE = {
  modelId: 'fal-f5-tts',
  adapterType: AI_ADAPTER_TYPES.FAL,
  providerConfig: { label: 'FAL', baseUrl: 'https://queue.fal.run' },
  apiKey: 'fal-key-123',
  resolvedApiKeyId: 'key-1',
  isFreeGeneration: false,
  creditCost: 1,
}
const BASE_SYNC_REQUEST: GenerateAudioRequest = {
  prompt: 'Hello world',
  modelId: 'fish-audio-s2-pro',
}
const BASE_ASYNC_REQUEST: GenerateAudioRequest = {
  prompt: 'Hello world',
  modelId: 'fal-f5-tts',
  apiKeyId: 'key-1',
}

function setupSyncHappyPath(mockGenerateAudio = vi.fn()) {
  vi.mocked(ensureUser).mockResolvedValue(FAKE_USER as never)
  vi.mocked(resolveGenerationRoute).mockResolvedValue(FAKE_SYNC_ROUTE as never)
  vi.mocked(getProviderAdapter).mockReturnValue({
    generateAudio: mockGenerateAudio,
  } as never)
  mockGenerateAudio.mockResolvedValue({
    audioUrl: 'https://provider.example.com/audio.mp3',
    format: 'mp3',
    duration: 3.5,
    requestCount: 1,
  })
  vi.mocked(fetchAsBuffer).mockResolvedValue({
    buffer: Buffer.from('fake-audio'),
    mimeType: 'audio/mpeg',
  } as never)
  vi.mocked(generateStorageKey).mockReturnValue('audio/user-1/gen.mp3')
  vi.mocked(uploadToR2).mockResolvedValue('https://cdn.example.com/audio.mp3')
  vi.mocked(createGenerationJob).mockResolvedValue(FAKE_SYNC_JOB as never)
  vi.mocked(createGeneration).mockResolvedValue(FAKE_GENERATION as never)
  vi.mocked(createApiUsageEntry).mockResolvedValue(FAKE_USAGE as never)
  vi.mocked(completeGenerationJob).mockResolvedValue(undefined as never)
}

// ─── Tests ─────────────────────────────────────────────────────

describe('generateAudioForUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns generation record on success', async () => {
    setupSyncHappyPath()

    const result = await generateAudioForUser('clerk-1', BASE_SYNC_REQUEST)

    expect(result).toEqual(FAKE_GENERATION)
    expect(createGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        outputType: 'AUDIO',
        url: 'https://cdn.example.com/audio.mp3',
        prompt: 'Hello world',
      }),
    )
    expect(completeGenerationJob).toHaveBeenCalledWith(
      'job-sync-1',
      expect.any(Object),
    )
  })

  it('forwards sampleRate to adapter', async () => {
    const mockGenerateAudio = vi.fn().mockResolvedValue({
      audioUrl: 'https://provider.example.com/audio.mp3',
      format: 'mp3',
      duration: 2,
      requestCount: 1,
    })
    setupSyncHappyPath(mockGenerateAudio)

    await generateAudioForUser('clerk-1', {
      ...BASE_SYNC_REQUEST,
      sampleRate: 22050,
    })

    expect(mockGenerateAudio).toHaveBeenCalledWith(
      expect.objectContaining({ sampleRate: 22050 }),
    )
  })

  it('uses generationJobId pattern in createApiUsageEntry', async () => {
    setupSyncHappyPath()

    await generateAudioForUser('clerk-1', BASE_SYNC_REQUEST)

    expect(createApiUsageEntry).toHaveBeenCalledWith(
      expect.objectContaining({ generationJobId: 'job-sync-1' }),
    )
    expect(createApiUsageEntry).toHaveBeenCalledWith(
      expect.objectContaining({ generationId: 'gen-1' }),
    )
  })

  it('throws UNSUPPORTED_MODEL when adapter has no generateAudio method', async () => {
    vi.mocked(ensureUser).mockResolvedValue(FAKE_USER as never)
    vi.mocked(resolveGenerationRoute).mockResolvedValue(
      FAKE_SYNC_ROUTE as never,
    )
    vi.mocked(getProviderAdapter).mockReturnValue({} as never)

    await expect(
      generateAudioForUser('clerk-1', BASE_SYNC_REQUEST),
    ).rejects.toMatchObject({
      code: 'UNSUPPORTED_MODEL',
      status: 400,
    })
  })

  it('calls failGenerationJob and rethrows on ProviderError', async () => {
    const mockGenerateAudio = vi.fn()
    setupSyncHappyPath(mockGenerateAudio)
    mockGenerateAudio.mockRejectedValue(
      new ProviderError('Fish Audio', 429, 'Rate limited'),
    )

    await expect(
      generateAudioForUser('clerk-1', BASE_SYNC_REQUEST),
    ).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
      status: 429,
    })

    expect(failGenerationJob).toHaveBeenCalledWith(
      'job-sync-1',
      expect.objectContaining({
        errorMessage: expect.any(String),
      }),
    )
  })

  it('calls failGenerationJob and rethrows on R2 upload failure', async () => {
    setupSyncHappyPath()
    vi.mocked(uploadToR2).mockRejectedValue(new Error('R2 connection refused'))

    await expect(
      generateAudioForUser('clerk-1', BASE_SYNC_REQUEST),
    ).rejects.toThrow('R2 connection refused')

    expect(failGenerationJob).toHaveBeenCalledWith(
      'job-sync-1',
      expect.objectContaining({
        errorMessage: 'R2 connection refused',
      }),
    )
  })
})

describe('submitAudioGeneration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(ensureUser).mockResolvedValue(FAKE_USER as never)
    vi.mocked(resolveGenerationRoute).mockResolvedValue(
      FAKE_ASYNC_ROUTE as never,
    )
    vi.mocked(createGenerationJob).mockResolvedValue({
      id: FAKE_ASYNC_JOB.id,
    } as never)
    vi.mocked(createExecutionOutbox).mockResolvedValue({
      id: 'outbox-audio-1',
    } as never)
  })

  it('creates a durable job and execution outbox before any provider submit', async () => {
    const submitAudioToQueue = vi.fn()
    vi.mocked(getProviderAdapter).mockReturnValue({
      submitAudioToQueue,
    } as never)

    const result = await submitAudioGeneration('clerk-1', BASE_ASYNC_REQUEST)

    expect(result).toEqual({
      jobId: 'job-async-1',
    })
    expect(createGenerationJob).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        modelId: 'fal-f5-tts',
        prompt: 'Hello world',
      }),
      expect.anything(),
    )
    expect(createExecutionOutbox).toHaveBeenCalledWith(
      expect.objectContaining({
        generationJobId: 'job-async-1',
        kind: EXECUTION_OUTBOX_KINDS.AUDIO_QUEUE_SUBMIT,
        payload: expect.objectContaining({
          prompt: 'Hello world',
        }),
      }),
      expect.anything(),
    )
    expect(
      vi.mocked(createGenerationJob).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(createExecutionOutbox).mock.invocationCallOrder[0]!,
    )
    expect(submitAudioToQueue).not.toHaveBeenCalled()
    expect(
      vi.mocked(createGenerationJob).mock.calls[0]?.[0]?.externalRequestId,
    ).toContain('"providerConfig"')
  })

  it('fails before creating durable state when the model has no async submit support', async () => {
    vi.mocked(getProviderAdapter).mockReturnValue({} as never)

    await expect(
      submitAudioGeneration('clerk-1', BASE_ASYNC_REQUEST),
    ).rejects.toMatchObject({
      code: 'UNSUPPORTED_MODEL',
      status: 400,
    })

    expect(createGenerationJob).not.toHaveBeenCalled()
    expect(createExecutionOutbox).not.toHaveBeenCalled()
  })
})

describe('checkAudioGenerationStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(ensureUser).mockResolvedValue(FAKE_USER as never)
    vi.mocked(getApiKeyValueById).mockResolvedValue({
      id: 'key-1',
      modelId: 'fal-f5-tts',
      adapterType: AI_ADAPTER_TYPES.FAL,
      providerConfig: { label: 'FAL', baseUrl: 'https://queue.fal.run' },
      label: 'FAL key',
      keyValue: 'fal-key-123',
    } as never)
    vi.mocked(getSystemApiKey).mockReturnValue(null)
    vi.mocked(createApiUsageEntry).mockResolvedValue(FAKE_USAGE as never)
    vi.mocked(completeGenerationJob).mockResolvedValue(undefined as never)
    vi.mocked(fetchAsBuffer).mockResolvedValue({
      buffer: Buffer.from('audio'),
      mimeType: 'audio/mpeg',
    } as never)
    vi.mocked(generateStorageKey).mockReturnValue('audio/user-1/gen.mp3')
    vi.mocked(uploadToR2).mockResolvedValue('https://cdn.example.com/audio.mp3')
    vi.mocked(createGeneration).mockResolvedValue(FAKE_GENERATION as never)
    vi.mocked(tryClaimExecutionOutbox).mockResolvedValue(false)
    vi.mocked(completeExecutionOutbox).mockResolvedValue({
      id: 'outbox-audio-1',
    } as never)
    vi.mocked(failExecutionOutbox).mockResolvedValue({
      id: 'outbox-audio-1',
    } as never)
    vi.mocked(failExpiredExecutionOutbox).mockResolvedValue(true)
    vi.mocked(annotateExecutionOutbox).mockResolvedValue({
      id: 'outbox-audio-1',
    } as never)
    mockGenerationJobUpdate.mockResolvedValue(undefined)
  })

  it('rejects when the job does not exist or is not owned by the user', async () => {
    mockGenerationJobFindUnique.mockResolvedValue(null)

    await expect(
      checkAudioGenerationStatus('clerk-1', 'missing-job'),
    ).rejects.toMatchObject({
      code: 'JOB_NOT_FOUND',
      status: 404,
    })
  })

  it('returns cached completed generation without polling the provider', async () => {
    const cachedJob = {
      ...FAKE_ASYNC_JOB,
      status: 'COMPLETED',
      generation: FAKE_GENERATION,
    }
    const checkAudioQueueStatus = vi.fn()
    mockGenerationJobFindUnique.mockResolvedValue(cachedJob)
    vi.mocked(getProviderAdapter).mockReturnValue({
      checkAudioQueueStatus,
    } as never)

    const result = await checkAudioGenerationStatus('clerk-1', 'job-async-1')

    expect(result).toEqual({
      jobId: 'job-async-1',
      status: 'COMPLETED',
      generation: FAKE_GENERATION,
    })
    expect(checkAudioQueueStatus).not.toHaveBeenCalled()
    expect(getApiKeyValueById).not.toHaveBeenCalled()
  })

  it('returns IN_PROGRESS when another request already claimed finalization', async () => {
    const checkAudioQueueStatus = vi.fn().mockResolvedValue({
      status: 'COMPLETED',
      result: {
        audioUrl: 'https://provider.example.com/audio.mp3',
        format: 'mp3',
        duration: 3.5,
        requestCount: 1,
      },
    })
    mockGenerationJobFindUnique
      .mockResolvedValueOnce(FAKE_ASYNC_JOB)
      .mockResolvedValueOnce({
        ...FAKE_ASYNC_JOB,
        status: 'QUEUED',
        generation: null,
      })
    mockGenerationJobUpdateMany.mockResolvedValue({ count: 0 })
    vi.mocked(getProviderAdapter).mockReturnValue({
      checkAudioQueueStatus,
    } as never)

    const result = await checkAudioGenerationStatus('clerk-1', 'job-async-1')

    expect(result).toEqual({
      jobId: 'job-async-1',
      status: 'IN_PROGRESS',
    })
    expect(createGeneration).not.toHaveBeenCalled()
  })

  it('fails the job when the provider reports COMPLETED without a result payload', async () => {
    const checkAudioQueueStatus = vi.fn().mockResolvedValue({
      status: 'COMPLETED',
    })
    mockGenerationJobFindUnique.mockResolvedValue(FAKE_ASYNC_JOB)
    vi.mocked(getProviderAdapter).mockReturnValue({
      checkAudioQueueStatus,
    } as never)

    const result = await checkAudioGenerationStatus('clerk-1', 'job-async-1')

    expect(result).toEqual({
      jobId: 'job-async-1',
      status: 'FAILED',
    })
    expect(failGenerationJob).toHaveBeenCalledWith(
      'job-async-1',
      expect.objectContaining({
        errorMessage: 'Provider returned completed but no result',
      }),
    )
  })

  it('finalizes the job once and links usage to the completed generation', async () => {
    const checkAudioQueueStatus = vi.fn().mockResolvedValue({
      status: 'COMPLETED',
      result: {
        audioUrl: 'https://provider.example.com/audio.mp3',
        format: 'mp3',
        duration: 3.5,
        requestCount: 1,
      },
    })
    mockGenerationJobFindUnique.mockResolvedValue(FAKE_ASYNC_JOB)
    mockGenerationJobUpdateMany.mockResolvedValue({ count: 1 })
    vi.mocked(getProviderAdapter).mockReturnValue({
      checkAudioQueueStatus,
    } as never)

    const result = await checkAudioGenerationStatus('clerk-1', 'job-async-1')

    expect(result).toEqual({
      jobId: 'job-async-1',
      status: 'COMPLETED',
      generation: FAKE_GENERATION,
    })
    expect(resolveGenerationRoute).not.toHaveBeenCalled()
    expect(getApiKeyValueById).toHaveBeenCalledWith('key-1', 'user-1')
    expect(createApiUsageEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        generationId: 'gen-1',
        generationJobId: 'job-async-1',
        modelId: 'fal-f5-tts',
      }),
      expect.anything(),
    )
    expect(completeGenerationJob).toHaveBeenCalledWith(
      'job-async-1',
      expect.objectContaining({
        generationId: 'gen-1',
        requestCount: 1,
      }),
      expect.anything(),
    )
  })

  it('preserves free-tier completions on async finalize', async () => {
    const freeAsyncJob = {
      ...FAKE_ASYNC_JOB,
      externalRequestId: JSON.stringify({
        requestId: 'req-free-1',
        statusUrl: 'https://fal.example.com/status',
        responseUrl: 'https://fal.example.com/result',
        route: {
          modelId: 'fal-f5-tts',
          adapterType: AI_ADAPTER_TYPES.FAL,
          provider: 'FAL',
          providerConfig: {
            label: 'FAL',
            baseUrl: 'https://queue.fal.run',
          },
          apiKeyId: null,
          isFreeGeneration: true,
        },
      }),
    }
    const checkAudioQueueStatus = vi.fn().mockResolvedValue({
      status: 'COMPLETED',
      result: {
        audioUrl: 'https://provider.example.com/audio.mp3',
        format: 'mp3',
        duration: 3.5,
        requestCount: 1,
      },
    })
    mockGenerationJobFindUnique.mockResolvedValue(freeAsyncJob)
    mockGenerationJobUpdateMany.mockResolvedValue({ count: 1 })
    vi.mocked(getProviderAdapter).mockReturnValue({
      checkAudioQueueStatus,
    } as never)
    vi.mocked(getSystemApiKey).mockReturnValue('platform-fal-key')

    await checkAudioGenerationStatus('clerk-1', 'job-async-1')

    expect(getApiKeyValueById).not.toHaveBeenCalled()
    expect(createGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        isFreeGeneration: true,
      }),
      expect.anything(),
    )
  })

  it('dispatches a pending audio outbox on first status poll', async () => {
    const pendingJob = {
      ...FAKE_ASYNC_JOB,
      externalRequestId: JSON.stringify({
        route: {
          modelId: 'fal-f5-tts',
          adapterType: AI_ADAPTER_TYPES.FAL,
          provider: 'FAL',
          providerConfig: {
            label: 'FAL',
            baseUrl: 'https://queue.fal.run',
          },
          apiKeyId: 'key-1',
          isFreeGeneration: false,
        },
      }),
    }
    const submitAudioToQueue = vi.fn().mockResolvedValue({
      requestId: 'req-outbox-1',
      statusUrl: 'https://fal.example.com/status',
      responseUrl: 'https://fal.example.com/result',
    })
    const checkAudioQueueStatus = vi.fn().mockResolvedValue({
      status: 'IN_PROGRESS',
    })
    mockGenerationJobFindUnique.mockResolvedValue(pendingJob)
    vi.mocked(tryClaimExecutionOutbox).mockResolvedValue(true)
    vi.mocked(getProviderAdapter).mockReturnValue({
      submitAudioToQueue,
      checkAudioQueueStatus,
    } as never)

    const result = await checkAudioGenerationStatus('clerk-1', 'job-async-1')

    expect(result).toEqual({
      jobId: 'job-async-1',
      status: 'IN_PROGRESS',
    })
    expect(submitAudioToQueue).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'Hello world',
      }),
    )
    expect(completeExecutionOutbox).toHaveBeenCalledWith(
      'outbox-audio-1',
      expect.objectContaining({
        result: expect.objectContaining({
          requestId: 'req-outbox-1',
        }),
      }),
    )
    expect(mockGenerationJobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job-async-1' },
        data: expect.objectContaining({
          externalRequestId: expect.any(String),
        }),
      }),
    )
  })

  it('fails jobs whose execution lease expired before queue metadata was persisted', async () => {
    const staleJob = {
      ...FAKE_ASYNC_JOB,
      externalRequestId: JSON.stringify({
        route: {
          modelId: 'fal-f5-tts',
          adapterType: AI_ADAPTER_TYPES.FAL,
          provider: 'FAL',
          providerConfig: {
            label: 'FAL',
            baseUrl: 'https://queue.fal.run',
          },
          apiKeyId: 'key-1',
          isFreeGeneration: false,
        },
      }),
      executionOutbox: {
        ...FAKE_ASYNC_JOB.executionOutbox,
        status: 'PROCESSING' as const,
        leaseExpiresAt: new Date('2026-04-22T23:00:00.000Z'),
      },
    }
    mockGenerationJobFindUnique
      .mockResolvedValueOnce(staleJob)
      .mockResolvedValueOnce({
        ...staleJob,
        status: 'FAILED',
      })

    const result = await checkAudioGenerationStatus('clerk-1', 'job-async-1')

    expect(result).toEqual({
      jobId: 'job-async-1',
      status: 'FAILED',
    })
    expect(failExpiredExecutionOutbox).toHaveBeenCalledWith(
      'outbox-audio-1',
      'Audio execution lease expired before queue metadata was persisted',
    )
  })

  it('fails incomplete jobs that have no execution outbox to recover queue metadata', async () => {
    const incompleteJob = {
      ...FAKE_ASYNC_JOB,
      externalRequestId: JSON.stringify({
        route: {
          modelId: 'fal-f5-tts',
          adapterType: AI_ADAPTER_TYPES.FAL,
          provider: 'FAL',
          providerConfig: {
            label: 'FAL',
            baseUrl: 'https://queue.fal.run',
          },
          apiKeyId: 'key-1',
          isFreeGeneration: false,
        },
      }),
      executionOutbox: null,
    }
    mockGenerationJobFindUnique
      .mockResolvedValueOnce(incompleteJob)
      .mockResolvedValueOnce({
        ...incompleteJob,
        status: 'FAILED',
      })

    const result = await checkAudioGenerationStatus('clerk-1', 'job-async-1')

    expect(result).toEqual({
      jobId: 'job-async-1',
      status: 'FAILED',
    })
    expect(failGenerationJob).toHaveBeenCalledWith(
      'job-async-1',
      expect.objectContaining({
        errorMessage: 'Audio queue request metadata is unavailable',
      }),
    )
  })

  it('does not write success usage when asset persistence fails', async () => {
    const checkAudioQueueStatus = vi.fn().mockResolvedValue({
      status: 'COMPLETED',
      result: {
        audioUrl: 'https://provider.example.com/audio.mp3',
        format: 'mp3',
        duration: 3.5,
        requestCount: 1,
      },
    })
    mockGenerationJobFindUnique.mockResolvedValue(FAKE_ASYNC_JOB)
    mockGenerationJobUpdateMany.mockResolvedValue({ count: 1 })
    vi.mocked(getProviderAdapter).mockReturnValue({
      checkAudioQueueStatus,
    } as never)
    vi.mocked(uploadToR2).mockRejectedValueOnce(new Error('R2 unavailable'))

    await expect(
      checkAudioGenerationStatus('clerk-1', 'job-async-1'),
    ).rejects.toThrow('R2 unavailable')

    expect(createApiUsageEntry).not.toHaveBeenCalled()
    expect(failGenerationJob).toHaveBeenCalledWith(
      'job-async-1',
      expect.objectContaining({
        errorMessage: 'R2 unavailable',
      }),
    )
  })
})
