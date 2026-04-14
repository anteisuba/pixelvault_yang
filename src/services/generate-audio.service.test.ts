import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Mock all external dependencies ────────────────────────────

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
    getProviderLabel: vi.fn(() => 'Fish Audio'),
  }
})

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { GenerateAudioRequest } from '@/types'
import { generateAudioForUser } from '@/services/generate-audio.service'
import {
  GenerateImageServiceError,
  resolveGenerationRoute,
} from '@/services/generate-image.service'
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
const FAKE_JOB = { id: 'job-1' }
const FAKE_USAGE = { id: 'usage-1' }
const FAKE_GENERATION = {
  id: 'gen-1',
  url: 'https://cdn.example.com/audio.mp3',
  prompt: 'Hello world',
  model: 'fish-audio-s2-pro',
  outputType: 'AUDIO',
}
const FAKE_ROUTE = {
  modelId: 'fish-audio-s2-pro',
  adapterType: AI_ADAPTER_TYPES.FISH_AUDIO,
  providerConfig: { label: 'Fish Audio', baseUrl: 'https://api.fish.audio' },
  apiKey: 'test-key-123',
  creditCost: 1,
}
const BASE_REQUEST: GenerateAudioRequest = {
  prompt: 'Hello world',
  modelId: 'fish-audio-s2-pro',
}

function setupHappyPath(mockGenerateAudio = vi.fn()) {
  vi.mocked(ensureUser).mockResolvedValue(FAKE_USER as never)
  vi.mocked(resolveGenerationRoute).mockResolvedValue(FAKE_ROUTE as never)
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
  vi.mocked(createGenerationJob).mockResolvedValue(FAKE_JOB as never)
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
    setupHappyPath()

    const result = await generateAudioForUser('clerk-1', BASE_REQUEST)

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
      'job-1',
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
    setupHappyPath(mockGenerateAudio)

    await generateAudioForUser('clerk-1', {
      ...BASE_REQUEST,
      sampleRate: 22050,
    })

    expect(mockGenerateAudio).toHaveBeenCalledWith(
      expect.objectContaining({ sampleRate: 22050 }),
    )
  })

  it('uses generationJobId pattern in createApiUsageEntry', async () => {
    setupHappyPath()

    await generateAudioForUser('clerk-1', BASE_REQUEST)

    expect(createApiUsageEntry).toHaveBeenCalledWith(
      expect.objectContaining({ generationJobId: 'job-1' }),
    )
    expect(createApiUsageEntry).toHaveBeenCalledWith(
      expect.not.objectContaining({ generationId: expect.anything() }),
    )
  })

  it('throws UNSUPPORTED_MODEL when adapter has no generateAudio method', async () => {
    vi.mocked(ensureUser).mockResolvedValue(FAKE_USER as never)
    vi.mocked(resolveGenerationRoute).mockResolvedValue(FAKE_ROUTE as never)
    vi.mocked(getProviderAdapter).mockReturnValue({} as never)

    await expect(
      generateAudioForUser('clerk-1', BASE_REQUEST),
    ).rejects.toMatchObject({
      code: 'UNSUPPORTED_MODEL',
      status: 400,
    })
  })

  it('calls failGenerationJob and rethrows on ProviderError', async () => {
    const mockGenerateAudio = vi.fn()
    setupHappyPath(mockGenerateAudio)
    mockGenerateAudio.mockRejectedValue(
      new ProviderError('Fish Audio', 429, 'Rate limited'),
    )

    await expect(
      generateAudioForUser('clerk-1', BASE_REQUEST),
    ).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
      status: 429,
    })

    expect(failGenerationJob).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({
        errorMessage: expect.any(String),
      }),
    )
  })

  it('calls failGenerationJob and rethrows on R2 upload failure', async () => {
    setupHappyPath()
    vi.mocked(uploadToR2).mockRejectedValue(new Error('R2 connection refused'))

    await expect(generateAudioForUser('clerk-1', BASE_REQUEST)).rejects.toThrow(
      'R2 connection refused',
    )

    expect(failGenerationJob).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({
        errorMessage: 'R2 connection refused',
      }),
    )
  })
})
