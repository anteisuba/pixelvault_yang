import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Mock all external dependencies ────────────────────────────

const mockGenerationJobFindUnique = vi.fn()
const mockGenerationJobUpdate = vi.fn()
const mockGenerationJobUpdateMany = vi.fn()

vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn(),
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
import type { GenerateAudioRequest } from '@/types'
import {
  checkAudioGenerationStatus,
  generateAudioForUser,
  submitAudioGeneration,
} from '@/services/generate-audio.service'
import { resolveGenerationRoute } from '@/services/generate-image.service'
import { ensureUser } from '@/services/user.service'
import { getProviderAdapter } from '@/services/providers/registry'
import { createGeneration } from '@/services/generation.service'
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
  attachUsageEntryToGeneration,
} from '@/services/usage.service'
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
    apiKeyId: 'key-1',
  }),
  createdAt: new Date('2026-04-23T00:00:00.000Z'),
  generation: null,
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
  creditCost: 1,
}
const FAKE_ASYNC_ROUTE = {
  modelId: 'fal-f5-tts',
  adapterType: AI_ADAPTER_TYPES.FAL,
  providerConfig: { label: 'FAL', baseUrl: 'https://queue.fal.run' },
  apiKey: 'fal-key-123',
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
  vi.mocked(attachUsageEntryToGeneration).mockResolvedValue(undefined as never)
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
    expect(attachUsageEntryToGeneration).toHaveBeenCalledWith(
      'usage-1',
      'gen-1',
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
      expect.not.objectContaining({ generationId: expect.anything() }),
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
  })

  it('returns server-owned job references and stores queue metadata', async () => {
    const submitAudioToQueue = vi.fn().mockResolvedValue({
      requestId: 'req-1',
      statusUrl: 'https://fal.example.com/status',
      responseUrl: 'https://fal.example.com/result',
    })
    vi.mocked(getProviderAdapter).mockReturnValue({
      submitAudioToQueue,
    } as never)
    mockGenerationJobUpdate.mockResolvedValue(undefined)

    const result = await submitAudioGeneration('clerk-1', BASE_ASYNC_REQUEST)

    expect(result).toEqual({
      jobId: 'job-async-1',
      requestId: 'req-1',
    })
    expect(createGenerationJob).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        modelId: 'fal-f5-tts',
      }),
    )
    expect(mockGenerationJobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job-async-1' },
        data: expect.objectContaining({
          prompt: 'Hello world',
        }),
      }),
    )
    expect(
      mockGenerationJobUpdate.mock.calls[0]?.[0]?.data.externalRequestId,
    ).toContain('"apiKeyId":"key-1"')
  })
})

describe('checkAudioGenerationStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(ensureUser).mockResolvedValue(FAKE_USER as never)
    vi.mocked(resolveGenerationRoute).mockResolvedValue(
      FAKE_ASYNC_ROUTE as never,
    )
    vi.mocked(createApiUsageEntry).mockResolvedValue(FAKE_USAGE as never)
    vi.mocked(attachUsageEntryToGeneration).mockResolvedValue(
      undefined as never,
    )
    vi.mocked(completeGenerationJob).mockResolvedValue(undefined as never)
    vi.mocked(fetchAsBuffer).mockResolvedValue({
      buffer: Buffer.from('audio'),
      mimeType: 'audio/mpeg',
    } as never)
    vi.mocked(generateStorageKey).mockReturnValue('audio/user-1/gen.mp3')
    vi.mocked(uploadToR2).mockResolvedValue('https://cdn.example.com/audio.mp3')
    vi.mocked(createGeneration).mockResolvedValue(FAKE_GENERATION as never)
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
    expect(createApiUsageEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        generationJobId: 'job-async-1',
        modelId: 'fal-f5-tts',
      }),
    )
    expect(attachUsageEntryToGeneration).toHaveBeenCalledWith(
      'usage-1',
      'gen-1',
    )
    expect(completeGenerationJob).toHaveBeenCalledWith(
      'job-async-1',
      expect.objectContaining({
        generationId: 'gen-1',
        requestCount: 1,
      }),
    )
  })
})
