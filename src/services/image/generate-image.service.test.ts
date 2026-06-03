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
}))
const { mockBuildRecipeSnapshotForUser } = vi.hoisted(() => ({
  mockBuildRecipeSnapshotForUser: vi.fn(),
}))
vi.mock('@/services/prompts/recipe.service', () => ({
  buildRecipeSnapshotForUser: (...args: unknown[]) =>
    mockBuildRecipeSnapshotForUser(...args),
}))
vi.mock('@/services/image/image-preview-derivative.service', () => ({
  enqueueImagePreviewDerivatives: vi.fn(),
}))
vi.mock('@/services/providers/registry', () => ({
  getProviderAdapter: vi.fn(),
}))
vi.mock('@/services/storage/r2', () => ({
  fetchAsBuffer: vi.fn(),
  generateStorageKey: vi.fn(),
  uploadToR2: vi.fn(),
  uploadFromHttpToR2: vi.fn(),
  isOwnedStorageUrl: vi.fn(() => false),
}))
vi.mock('@/services/usage.service', () => ({
  atomicReserveFreeTierSlot: vi.fn(),
  createApiUsageEntry: vi.fn(),
  createGenerationJob: vi.fn(),
  completeGenerationJob: vi.fn(),
  failGenerationJob: vi.fn(),
  attachUsageEntryToGeneration: vi.fn(),
}))
vi.mock('@/lib/platform-keys', () => ({
  getSystemApiKey: vi.fn(),
  getSystemCivitaiToken: vi.fn(() => null),
}))
vi.mock('@/services/civitai-token.service', () => ({
  getCivitaiTokenByInternalUserId: vi.fn(() => Promise.resolve(null)),
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
vi.mock('@/services/kernel/prompt-guard', () => ({
  validatePrompt: vi.fn(() => ({ valid: true })),
}))
const { modelsMock } = vi.hoisted(() => ({
  modelsMock: {
    realGetModelById: undefined as
      | ((
          id: string,
        ) => ReturnType<(typeof import('@/constants/models'))['getModelById']>)
      | undefined,
  },
}))

vi.mock('@/constants/models', async () => {
  const actual =
    await vi.importActual<typeof import('@/constants/models')>(
      '@/constants/models',
    )
  modelsMock.realGetModelById = actual.getModelById
  return { ...actual, getModelById: vi.fn(actual.getModelById) }
})

import { AI_MODELS, getModelById } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { GenerateRequest } from '@/types'
import {
  generateImageForUser,
  GenerateImageServiceError,
  resolveGenerationRoute,
} from '@/services/image/generate-image.service'
import { ensureUser } from '@/services/user.service'
import {
  findActiveKeyForAdapter,
  getApiKeyValueById,
} from '@/services/apiKey.service'
import { createGeneration } from '@/services/generation.service'
import { enqueueImagePreviewDerivatives } from '@/services/image/image-preview-derivative.service'
import { getProviderAdapter } from '@/services/providers/registry'
import {
  fetchAsBuffer,
  generateStorageKey,
  isOwnedStorageUrl,
  uploadFromHttpToR2,
  uploadToR2,
} from '@/services/storage/r2'
import {
  atomicReserveFreeTierSlot,
  createApiUsageEntry,
  createGenerationJob,
  completeGenerationJob,
  failGenerationJob,
  attachUsageEntryToGeneration,
} from '@/services/usage.service'
import { getSystemApiKey } from '@/lib/platform-keys'
import { validatePrompt } from '@/services/kernel/prompt-guard'
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

function freeLimitError(message = 'Free tier limit reached (20/day).') {
  return Object.assign(new Error(message), {
    code: 'FREE_LIMIT_EXCEEDED' as const,
  })
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
  // Restore getModelById to real implementation (previous test may have overridden it)
  vi.mocked(getModelById).mockImplementation(modelsMock.realGetModelById!)
  vi.mocked(ensureUser).mockResolvedValue(FAKE_USER as never)
  vi.mocked(findActiveKeyForAdapter).mockResolvedValue(null)
  vi.mocked(atomicReserveFreeTierSlot).mockResolvedValue(undefined)
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
  vi.mocked(enqueueImagePreviewDerivatives).mockResolvedValue({
    id: 'outbox-1',
  } as never)
  vi.mocked(uploadFromHttpToR2).mockResolvedValue({
    publicUrl: 'https://cdn.example.com/image.png',
    mimeType: 'image/png',
  })
  vi.mocked(isOwnedStorageUrl).mockReturnValue(false)
  vi.mocked(createGeneration).mockResolvedValue(FAKE_GENERATION as never)
  mockBuildRecipeSnapshotForUser.mockResolvedValue({
    sourceType: 'prompt_template',
    recipeId: 'recipe_abc',
  })
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
    vi.mocked(atomicReserveFreeTierSlot).mockResolvedValue(undefined)
    vi.mocked(getSystemApiKey).mockReturnValue('platform-key')

    const route = await resolveGenerationRoute('user-1', {
      modelId: 'gemini-3.1-flash-image-preview',
    })

    expect(route.apiKey).toBe('platform-key')
    expect(route.isFreeGeneration).toBe(true)
  })

  it('throws FREE_LIMIT_EXCEEDED when daily limit reached', async () => {
    vi.mocked(findActiveKeyForAdapter).mockResolvedValue(null)
    vi.mocked(atomicReserveFreeTierSlot).mockRejectedValue(freeLimitError())

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

  it('throws UNSUPPORTED_MODEL for retired built-in models before route lookup', async () => {
    await expect(
      resolveGenerationRoute('user-1', {
        modelId: AI_MODELS.GEMINI_25_FLASH_IMAGE,
      }),
    ).rejects.toThrow(expect.objectContaining({ code: 'UNSUPPORTED_MODEL' }))

    expect(getApiKeyValueById).not.toHaveBeenCalled()
    expect(findActiveKeyForAdapter).not.toHaveBeenCalled()
  })

  it('throws MISSING_API_KEY when no user key and model is not free-tier', async () => {
    vi.mocked(findActiveKeyForAdapter).mockResolvedValue(null)

    // flux-2-pro is a built-in model but not free-tier
    await expect(
      resolveGenerationRoute('user-1', {
        modelId: 'flux-2-pro',
      }),
    ).rejects.toThrow(expect.objectContaining({ code: 'MISSING_API_KEY' }))
  })

  it('throws PLATFORM_KEY_MISSING when free tier enabled but platform key absent', async () => {
    vi.mocked(findActiveKeyForAdapter).mockResolvedValue(null)
    vi.mocked(atomicReserveFreeTierSlot).mockResolvedValue(undefined)
    vi.mocked(getSystemApiKey).mockReturnValue(undefined as never)

    await expect(
      resolveGenerationRoute('user-1', {
        modelId: 'gemini-3.1-flash-image-preview',
      }),
    ).rejects.toThrow(expect.objectContaining({ code: 'PLATFORM_KEY_MISSING' }))
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
    expect(fetchAsBuffer).toHaveBeenCalledWith(
      'https://provider.com/result.png',
    )
    expect(uploadToR2).toHaveBeenCalledWith({
      data: Buffer.from('fake'),
      key: 'storage/key.png',
      mimeType: 'image/png',
    })
    expect(createGeneration).toHaveBeenCalled()
    expect(createGeneration).toHaveBeenCalledWith(
      expect.not.objectContaining({
        thumbnailUrl: expect.anything(),
        previewUrl: expect.anything(),
      }),
    )
    expect(enqueueImagePreviewDerivatives).toHaveBeenCalledWith(
      expect.objectContaining({
        generationJobId: 'job-1',
        generationId: 'gen-1',
        sourceUrl: 'https://cdn.example.com/image.png',
        sourceStorageKey: 'storage/key.png',
      }),
    )
    expect(completeGenerationJob).toHaveBeenCalled()
    expect(attachUsageEntryToGeneration).toHaveBeenCalled()
  })

  it('reuses same-origin reference image URL without re-uploading', async () => {
    const sameOriginRef = 'https://cdn.test.com/generations/u1/image/ref.png'
    vi.mocked(isOwnedStorageUrl).mockImplementation(
      (url: string) => url === sameOriginRef,
    )

    await generateImageForUser('clerk-1', {
      ...BASE_INPUT,
      referenceImage: sameOriginRef,
    })

    expect(uploadFromHttpToR2).not.toHaveBeenCalled()
    expect(uploadToR2).toHaveBeenCalledTimes(1)
    expect(createGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ referenceImageUrl: sameOriginRef }),
    )
  })

  it('persists prompt template lineage when recipeUsage is provided', async () => {
    await generateImageForUser('clerk-1', {
      ...BASE_INPUT,
      recipeUsage: {
        recipeId: 'recipe_abc',
        recipeVersion: 1,
        useMode: 'apply',
      },
    })

    expect(mockBuildRecipeSnapshotForUser).toHaveBeenCalledWith('user-1', {
      recipeId: 'recipe_abc',
      recipeVersion: 1,
      useMode: 'apply',
    })
    expect(createGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        recipeSnapshot: {
          sourceType: 'prompt_template',
          recipeId: 'recipe_abc',
        },
      }),
    )
  })

  it('stream-uploads external reference image when not same-origin', async () => {
    vi.mocked(isOwnedStorageUrl).mockReturnValue(false)

    await generateImageForUser('clerk-1', {
      ...BASE_INPUT,
      referenceImage: 'https://example.com/external-ref.png',
    })

    expect(uploadFromHttpToR2).toHaveBeenCalledTimes(1)
    expect(uploadFromHttpToR2).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceUrl: 'https://example.com/external-ref.png',
      }),
    )
    expect(uploadToR2).toHaveBeenCalledTimes(1)
  })

  it('rejects invalid prompts', async () => {
    vi.mocked(validatePrompt).mockReturnValue({
      valid: false,
      reason: 'Prompt is too short',
      warnings: [],
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

  it('does not fallback for auto-routed user key failures', async () => {
    vi.mocked(getModelById).mockImplementation(modelsMock.realGetModelById!)
    vi.mocked(findActiveKeyForAdapter).mockImplementation(
      async (_userId, adapterType) =>
        adapterType === AI_ADAPTER_TYPES.GEMINI
          ? ({
              id: 'auto-gemini-key',
              adapterType: AI_ADAPTER_TYPES.GEMINI,
              providerConfig: {
                label: 'Gemini',
                baseUrl: 'https://gemini.api',
              },
              keyValue: 'auto-gemini-key-value',
              modelId: 'gemini-3.1-flash-image-preview',
            } as never)
          : null,
    )
    vi.mocked(getSystemApiKey).mockReturnValue('platform-openai-key')

    const geminiGenerate = vi
      .fn()
      .mockRejectedValue(
        new ProviderError('Gemini', 504, 'Gemini generateImage timed out'),
      )
    const openaiGenerate = vi.fn().mockResolvedValue({
      imageUrl: 'https://provider.com/fallback.png',
      width: 1024,
      height: 1024,
      requestCount: 1,
    })

    vi.mocked(getProviderAdapter).mockImplementation((adapterType) => {
      if (adapterType === AI_ADAPTER_TYPES.GEMINI) {
        return {
          adapterType: AI_ADAPTER_TYPES.GEMINI,
          generateImage: geminiGenerate,
        } as never
      }

      return {
        adapterType: AI_ADAPTER_TYPES.OPENAI,
        generateImage: openaiGenerate,
      } as never
    })

    await expect(generateImageForUser('clerk-1', BASE_INPUT)).rejects.toThrow(
      GenerateImageServiceError,
    )

    expect(geminiGenerate).toHaveBeenCalledTimes(1)
    expect(openaiGenerate).not.toHaveBeenCalled()
    expect(ensureUser).toHaveBeenCalledTimes(1)
  })

  it('throws VALIDATION_ERROR when model requires reference image but none provided', async () => {
    vi.mocked(getModelById).mockReturnValue({
      id: 'gemini-3.1-flash-image-preview',
      adapterType: AI_ADAPTER_TYPES.GEMINI,
      providerConfig: { label: 'Gemini', baseUrl: 'https://gemini.api' },
      cost: 1,
      available: true,
      freeTier: true,
      requiresReferenceImage: true,
    } as never)

    await expect(
      generateImageForUser('clerk-1', {
        ...BASE_INPUT,
        referenceImage: undefined,
        referenceImages: undefined,
      }),
    ).rejects.toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }))
  })

  it('throws VALIDATION_ERROR when selected model does not support reference images', async () => {
    vi.mocked(getApiKeyValueById).mockResolvedValue({
      adapterType: AI_ADAPTER_TYPES.FAL,
      providerConfig: { label: 'fal.ai', baseUrl: 'https://fal.run' },
      keyValue: 'fal-key',
      modelId: AI_MODELS.FLUX_LORA,
    } as never)

    await expect(
      generateImageForUser('clerk-1', {
        ...BYOK_INPUT,
        modelId: AI_MODELS.FLUX_LORA,
        referenceImages: ['https://cdn.example.com/reference.png'],
      }),
    ).rejects.toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }))
    expect(getProviderAdapter).not.toHaveBeenCalled()
  })

  it('throws UNSUPPORTED_MODEL when no provider adapter found', async () => {
    vi.mocked(getProviderAdapter).mockReturnValue(null as never)

    await expect(generateImageForUser('clerk-1', BASE_INPUT)).rejects.toThrow(
      expect.objectContaining({ code: 'UNSUPPORTED_MODEL' }),
    )
  })

  it('marks job as failed when R2 upload throws', async () => {
    vi.mocked(uploadToR2).mockRejectedValue(new Error('R2 upload failed'))

    await expect(generateImageForUser('clerk-1', BASE_INPUT)).rejects.toThrow(
      'R2 upload failed',
    )

    expect(failGenerationJob).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({ errorMessage: 'R2 upload failed' }),
    )
  })

  it('attempts provider fallback for free-tier transient failures, reusing the same job and reservation', async () => {
    // Make fallback model (gpt-image-2) also free-tier eligible
    const realImpl = modelsMock.realGetModelById!
    vi.mocked(getModelById).mockImplementation((id: string) => {
      const model = realImpl(id)
      if (!model) return undefined
      // Mark both primary and fallback models as free-tier for this test
      return { ...model, freeTier: true } as never
    })

    const generateImage = vi
      .fn()
      .mockRejectedValueOnce(new ProviderError('Gemini', 500, 'Server error'))
      .mockResolvedValueOnce({
        imageUrl: 'https://provider.com/fallback.png',
        width: 1024,
        height: 1024,
        requestCount: 1,
      })

    vi.mocked(getProviderAdapter).mockReturnValue({
      adapterType: AI_ADAPTER_TYPES.GEMINI,
      generateImage,
    } as never)

    // Also need platform key for the fallback model's adapter (OpenAI)
    vi.mocked(getSystemApiKey).mockReturnValue('platform-key')

    const result = await generateImageForUser('clerk-1', BASE_INPUT)

    expect(result.id).toBe('gen-1')
    expect(generateImage).toHaveBeenCalledTimes(2)
    // Fallback now reuses the same job + reservation instead of recursing
    // into generateImageForUser — so each of these runs exactly once.
    expect(ensureUser).toHaveBeenCalledTimes(1)
    expect(atomicReserveFreeTierSlot).toHaveBeenCalledTimes(1)
    expect(createGenerationJob).toHaveBeenCalledTimes(1)
  })

  it('records a single failure when both primary and fallback providers fail', async () => {
    const realImpl = modelsMock.realGetModelById!
    vi.mocked(getModelById).mockImplementation((id: string) => {
      const model = realImpl(id)
      if (!model) return undefined
      return { ...model, freeTier: true } as never
    })

    const generateImage = vi
      .fn()
      .mockRejectedValue(new ProviderError('Gemini', 500, 'Server error'))

    vi.mocked(getProviderAdapter).mockReturnValue({
      adapterType: AI_ADAPTER_TYPES.GEMINI,
      generateImage,
    } as never)
    vi.mocked(getSystemApiKey).mockReturnValue('platform-key')

    await expect(generateImageForUser('clerk-1', BASE_INPUT)).rejects.toThrow(
      GenerateImageServiceError,
    )

    // Primary + fallback both attempted...
    expect(generateImage).toHaveBeenCalledTimes(2)
    // ...but only one job + one reservation ever existed, and the failure
    // is recorded exactly once against that single job.
    expect(ensureUser).toHaveBeenCalledTimes(1)
    expect(atomicReserveFreeTierSlot).toHaveBeenCalledTimes(1)
    expect(createGenerationJob).toHaveBeenCalledTimes(1)
    expect(failGenerationJob).toHaveBeenCalledTimes(1)
    expect(createApiUsageEntry).toHaveBeenCalledTimes(1)
  })
})
