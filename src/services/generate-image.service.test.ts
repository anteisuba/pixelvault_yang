import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Mock all external dependencies ────────────────────────────

vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn(),
}))
vi.mock('@/services/apiKey.service', () => ({
  findActiveKeyForAdapter: vi.fn(),
  getApiKeyValueById: vi.fn(),
}))
vi.mock('@/services/generation.service', () => ({
  createGeneration: vi.fn(),
  getFreeGenerationCountToday: vi.fn(),
}))
vi.mock('@/services/providers/registry', () => ({
  getProviderAdapter: vi.fn(),
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
vi.mock('@/lib/platform-keys', () => ({
  getSystemApiKey: vi.fn(),
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
vi.mock('@/lib/prompt-guard', () => ({
  validatePrompt: vi.fn(() => ({ valid: true })),
}))

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { GenerateRequest } from '@/types'
import {
  generateImageForUser,
  GenerateImageServiceError,
  resolveGenerationRoute,
} from '@/services/generate-image.service'
import { ensureUser } from '@/services/user.service'
import {
  findActiveKeyForAdapter,
  getApiKeyValueById,
} from '@/services/apiKey.service'
import {
  createGeneration,
  getFreeGenerationCountToday,
} from '@/services/generation.service'
import { getProviderAdapter } from '@/services/providers/registry'
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
import { getSystemApiKey } from '@/lib/platform-keys'
import { validatePrompt } from '@/lib/prompt-guard'
import { ProviderError } from '@/services/providers/types'

// ─── Test Fixtures ─────────────────────────────────────────────

const FAKE_USER = { id: 'user-1', clerkId: 'clerk-1', credits: 100 }
const FAKE_JOB = { id: 'job-1' }
const FAKE_USAGE = { id: 'usage-1' }
const FAKE_GENERATION = {
  id: 'gen-1',
  url: 'https://cdn.example.com/image.png',
  prompt: 'test',
  model: 'gemini-3.1-flash-image-preview',
  width: 1024,
  height: 1024,
}

const BASE_INPUT: GenerateRequest = {
  prompt: 'A red circle',
  modelId: 'gemini-3.1-flash-image-preview',
  aspectRatio: '1:1',
}

const BYOK_INPUT: GenerateRequest = {
  ...BASE_INPUT,
  apiKeyId: 'key-1',
}

function setupBYOKRoute() {
  vi.mocked(getApiKeyValueById).mockResolvedValue({
    adapterType: AI_ADAPTER_TYPES.GEMINI,
    providerConfig: { label: 'Gemini', baseUrl: 'https://gemini.api' },
    keyValue: 'user-key-123',
    modelId: 'gemini-3.1-flash-image-preview',
  } as never)
}

function setupHappyPath() {
  vi.mocked(ensureUser).mockResolvedValue(FAKE_USER as never)
  vi.mocked(getFreeGenerationCountToday).mockResolvedValue(0)
  vi.mocked(getSystemApiKey).mockReturnValue('platform-key')
  vi.mocked(validatePrompt).mockReturnValue({ valid: true } as never)
  vi.mocked(getProviderAdapter).mockReturnValue({
    adapterType: AI_ADAPTER_TYPES.GEMINI,
    generateImage: vi.fn().mockResolvedValue({
      imageUrl: 'https://provider.com/result.png',
      width: 1024,
      height: 1024,
      requestCount: 1,
    }),
  } as never)
  vi.mocked(createGenerationJob).mockResolvedValue(FAKE_JOB as never)
  vi.mocked(createApiUsageEntry).mockResolvedValue(FAKE_USAGE as never)
  vi.mocked(fetchAsBuffer).mockResolvedValue({
    buffer: Buffer.from('fake'),
    mimeType: 'image/png',
  })
  vi.mocked(generateStorageKey).mockReturnValue('storage/key.png')
  vi.mocked(uploadToR2).mockResolvedValue('https://cdn.example.com/image.png')
  vi.mocked(createGeneration).mockResolvedValue(FAKE_GENERATION as never)
  vi.mocked(completeGenerationJob).mockResolvedValue(undefined as never)
  vi.mocked(attachUsageEntryToGeneration).mockResolvedValue(undefined as never)
}

// ─── Tests ─────────────────────────────────────────────────────

describe('resolveGenerationRoute', () => {
  beforeEach(() => vi.clearAllMocks())

  it('uses user API key when apiKeyId is provided', async () => {
    vi.mocked(getApiKeyValueById).mockResolvedValue({
      adapterType: AI_ADAPTER_TYPES.GEMINI,
      providerConfig: { label: 'Gemini', baseUrl: 'https://gemini.api' },
      keyValue: 'user-key-123',
      modelId: 'gemini-3.1-flash-image-preview',
    } as never)

    const route = await resolveGenerationRoute('user-1', {
      modelId: 'gemini-3.1-flash-image-preview',
      apiKeyId: 'key-1',
    })

    expect(route.apiKey).toBe('user-key-123')
    expect(route.isFreeGeneration).toBeUndefined()
  })

  it('throws INVALID_ROUTE_SELECTION when API key not found', async () => {
    vi.mocked(getApiKeyValueById).mockResolvedValue(null)

    await expect(
      resolveGenerationRoute('user-1', {
        modelId: 'gemini-3.1-flash-image-preview',
        apiKeyId: 'bad-key',
      }),
    ).rejects.toThrow(GenerateImageServiceError)
  })

  it('throws INVALID_ROUTE_SELECTION when key adapter mismatches model', async () => {
    vi.mocked(getApiKeyValueById).mockResolvedValue({
      adapterType: AI_ADAPTER_TYPES.FAL,
      providerConfig: { label: 'fal.ai', baseUrl: 'https://fal.run' },
      keyValue: 'fal-key',
      modelId: 'fal-model',
    } as never)

    await expect(
      resolveGenerationRoute('user-1', {
        modelId: 'gemini-3.1-flash-image-preview',
        apiKeyId: 'key-1',
      }),
    ).rejects.toThrow(GenerateImageServiceError)
  })

  it('auto-finds active key when no apiKeyId provided', async () => {
    vi.mocked(findActiveKeyForAdapter).mockResolvedValue({
      adapterType: AI_ADAPTER_TYPES.GEMINI,
      providerConfig: { label: 'Gemini', baseUrl: 'https://gemini.api' },
      keyValue: 'auto-key',
      modelId: 'gemini-3.1-flash-image-preview',
    } as never)

    const route = await resolveGenerationRoute('user-1', {
      modelId: 'gemini-3.1-flash-image-preview',
    })

    expect(route.apiKey).toBe('auto-key')
  })

  it('falls back to free tier when no user key exists', async () => {
    vi.mocked(findActiveKeyForAdapter).mockResolvedValue(null)
    vi.mocked(getFreeGenerationCountToday).mockResolvedValue(0)
    vi.mocked(getSystemApiKey).mockReturnValue('platform-key')

    const route = await resolveGenerationRoute('user-1', {
      modelId: 'gemini-3.1-flash-image-preview',
    })

    expect(route.apiKey).toBe('platform-key')
    expect(route.isFreeGeneration).toBe(true)
  })

  it('throws FREE_LIMIT_EXCEEDED when daily limit reached', async () => {
    vi.mocked(findActiveKeyForAdapter).mockResolvedValue(null)
    vi.mocked(getFreeGenerationCountToday).mockResolvedValue(999)

    await expect(
      resolveGenerationRoute('user-1', {
        modelId: 'gemini-3.1-flash-image-preview',
      }),
    ).rejects.toThrow(expect.objectContaining({ code: 'FREE_LIMIT_EXCEEDED' }))
  })

  it('throws CUSTOM_MODEL_REQUIRES_ROUTE for unknown model without API key', async () => {
    await expect(
      resolveGenerationRoute('user-1', {
        modelId: 'my-custom-model',
      }),
    ).rejects.toThrow(
      expect.objectContaining({ code: 'CUSTOM_MODEL_REQUIRES_ROUTE' }),
    )
  })
})

describe('generateImageForUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupHappyPath()
  })

  it('completes the full generation pipeline on success', async () => {
    const result = await generateImageForUser('clerk-1', BASE_INPUT)

    expect(result.id).toBe('gen-1')
    // Verify pipeline steps were called in order
    expect(ensureUser).toHaveBeenCalledWith('clerk-1')
    expect(validatePrompt).toHaveBeenCalledWith('A red circle')
    expect(createGenerationJob).toHaveBeenCalled()
    expect(createApiUsageEntry).toHaveBeenCalled()
    expect(fetchAsBuffer).toHaveBeenCalled()
    expect(uploadToR2).toHaveBeenCalled()
    expect(createGeneration).toHaveBeenCalled()
    expect(completeGenerationJob).toHaveBeenCalled()
    expect(attachUsageEntryToGeneration).toHaveBeenCalled()
  })

  it('rejects invalid prompts', async () => {
    vi.mocked(validatePrompt).mockReturnValue({
      valid: false,
      reason: 'Prompt is too short',
    })

    await expect(generateImageForUser('clerk-1', BASE_INPUT)).rejects.toThrow(
      GenerateImageServiceError,
    )
  })

  it('records failed usage when provider throws', async () => {
    setupBYOKRoute()

    vi.mocked(getProviderAdapter).mockReturnValue({
      adapterType: AI_ADAPTER_TYPES.GEMINI,
      generateImage: vi
        .fn()
        .mockRejectedValue(new ProviderError('Gemini', 500, 'Internal error')),
    } as never)

    await expect(generateImageForUser('clerk-1', BYOK_INPUT)).rejects.toThrow(
      GenerateImageServiceError,
    )

    expect(failGenerationJob).toHaveBeenCalled()
  })

  it('wraps ProviderError with correct status code', async () => {
    setupBYOKRoute()

    vi.mocked(getProviderAdapter).mockReturnValue({
      adapterType: AI_ADAPTER_TYPES.GEMINI,
      generateImage: vi
        .fn()
        .mockRejectedValue(new ProviderError('Gemini', 429, 'Rate limited')),
    } as never)

    try {
      await generateImageForUser('clerk-1', BYOK_INPUT)
      expect.fail('Should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(GenerateImageServiceError)
      expect((err as GenerateImageServiceError).status).toBe(429)
    }
  })

  it('maps 403 ProviderError to NOVELAI_TIER_LIMIT code', async () => {
    setupBYOKRoute()

    vi.mocked(getProviderAdapter).mockReturnValue({
      adapterType: AI_ADAPTER_TYPES.GEMINI,
      generateImage: vi
        .fn()
        .mockRejectedValue(
          new ProviderError('NovelAI', 403, 'Subscription required'),
        ),
    } as never)

    try {
      await generateImageForUser('clerk-1', BYOK_INPUT)
      expect.fail('Should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(GenerateImageServiceError)
      expect((err as GenerateImageServiceError).code).toBe('NOVELAI_TIER_LIMIT')
    }
  })

  it('does not fallback for BYOK failures', async () => {
    setupBYOKRoute()

    vi.mocked(getProviderAdapter).mockReturnValue({
      adapterType: AI_ADAPTER_TYPES.GEMINI,
      generateImage: vi
        .fn()
        .mockRejectedValue(new ProviderError('Gemini', 500, 'Server error')),
    } as never)

    await expect(generateImageForUser('clerk-1', BYOK_INPUT)).rejects.toThrow(
      GenerateImageServiceError,
    )

    // ensureUser is called only once (no recursive fallback call)
    expect(ensureUser).toHaveBeenCalledTimes(1)
  })
})
