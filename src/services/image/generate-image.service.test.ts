import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Mock all external dependencies ────────────────────────────

vi.mock('@/services/apiKey.service', () => ({
  findActiveKeyForAdapter: vi.fn(),
  getApiKeyValueById: vi.fn(),
}))
const { MockRunnerMonthlyLimitExceededError } = vi.hoisted(() => {
  class MockRunnerMonthlyLimitExceededError extends Error {
    readonly code = 'RUNNER_MONTHLY_LIMIT_EXCEEDED' as const
  }
  return { MockRunnerMonthlyLimitExceededError }
})
vi.mock('@/services/usage.service', () => ({
  atomicReserveFreeTierSlot: vi.fn(),
  assertRunnerMonthlyLimitNotExceeded: vi.fn(),
  RunnerMonthlyLimitExceededError: MockRunnerMonthlyLimitExceededError,
}))
vi.mock('@/lib/platform-keys', () => ({
  getSystemApiKey: vi.fn(),
}))
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
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
vi.mock('@/services/model-config.service', () => ({
  getResolvedModelOption: vi.fn(),
}))

import { AI_MODELS } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  GenerateImageServiceError,
  resolveGenerationRoute,
} from '@/services/image/generate-image.service'
import {
  findActiveKeyForAdapter,
  getApiKeyValueById,
} from '@/services/apiKey.service'
import {
  atomicReserveFreeTierSlot,
  assertRunnerMonthlyLimitNotExceeded,
} from '@/services/usage.service'
import { getSystemApiKey } from '@/lib/platform-keys'
import { getResolvedModelOption } from '@/services/model-config.service'

// ─── Test Fixtures ─────────────────────────────────────────────

function freeLimitError(message = 'Free tier limit reached (20/day).') {
  return Object.assign(new Error(message), {
    code: 'FREE_LIMIT_EXCEEDED' as const,
  })
}

// ─── Tests ─────────────────────────────────────────────────────

describe('resolveGenerationRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getResolvedModelOption).mockImplementation(async (modelId) =>
      modelsMock.realGetModelById!(modelId),
    )
  })

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
        modelId: AI_MODELS.ANIMA_PENCIL_XL,
      }),
    ).rejects.toThrow(expect.objectContaining({ code: 'UNSUPPORTED_MODEL' }))

    expect(getApiKeyValueById).not.toHaveBeenCalled()
    expect(findActiveKeyForAdapter).not.toHaveBeenCalled()
  })

  it('rejects a model immediately when the DB catalog marks it unavailable', async () => {
    vi.mocked(getResolvedModelOption).mockResolvedValue({
      ...modelsMock.realGetModelById!('flux-2-pro')!,
      available: false,
    })

    await expect(
      resolveGenerationRoute('user-1', { modelId: 'flux-2-pro' }),
    ).rejects.toThrow(expect.objectContaining({ code: 'UNSUPPORTED_MODEL' }))

    expect(getApiKeyValueById).not.toHaveBeenCalled()
    expect(findActiveKeyForAdapter).not.toHaveBeenCalled()
  })

  it('uses DB catalog adapter, external model id, and cost in the execution route', async () => {
    vi.mocked(getResolvedModelOption).mockResolvedValue({
      ...modelsMock.realGetModelById!('flux-2-pro')!,
      adapterType: AI_ADAPTER_TYPES.REPLICATE,
      externalModelId: 'owner/flux-new-version',
      cost: 7,
    })
    vi.mocked(getApiKeyValueById).mockResolvedValue({
      id: 'replicate-key-1',
      adapterType: AI_ADAPTER_TYPES.REPLICATE,
      providerConfig: {
        label: 'Replicate',
        baseUrl: 'https://api.replicate.com',
      },
      keyValue: 'replicate-key',
      modelId: 'flux-2-pro',
    } as never)

    const route = await resolveGenerationRoute('user-1', {
      modelId: 'flux-2-pro',
      apiKeyId: 'replicate-key-1',
    })

    expect(route).toMatchObject({
      adapterType: AI_ADAPTER_TYPES.REPLICATE,
      externalModelId: 'owner/flux-new-version',
      creditCost: 7,
    })
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

  describe('RUNNER adapter (Comfy Runner / RunPod)', () => {
    const RUNNER_MODEL = {
      id: 'illustrious-recipe-clone',
      adapterType: AI_ADAPTER_TYPES.RUNNER,
      providerConfig: {
        label: 'PixelVault Runner',
        baseUrl: 'https://api.runpod.ai/v2',
      },
      cost: 3,
      available: true,
    }

    it('routes to the system key without a per-day free-tier reservation', async () => {
      vi.mocked(getResolvedModelOption).mockResolvedValue(RUNNER_MODEL as never)
      vi.mocked(assertRunnerMonthlyLimitNotExceeded).mockResolvedValue(
        undefined,
      )
      vi.mocked(getSystemApiKey).mockReturnValue('runpod-key')

      const route = await resolveGenerationRoute('user-1', {
        modelId: 'illustrious-recipe-clone',
      })

      expect(route.adapterType).toBe(AI_ADAPTER_TYPES.RUNNER)
      expect(route.apiKey).toBe('runpod-key')
      expect(route.isFreeGeneration).toBe(false)
      expect(assertRunnerMonthlyLimitNotExceeded).toHaveBeenCalledOnce()
      expect(atomicReserveFreeTierSlot).not.toHaveBeenCalled()
      expect(findActiveKeyForAdapter).not.toHaveBeenCalled()
    })

    it('throws RUNNER_MONTHLY_LIMIT_EXCEEDED when the monthly budget cap is hit', async () => {
      vi.mocked(getResolvedModelOption).mockResolvedValue(RUNNER_MODEL as never)
      vi.mocked(assertRunnerMonthlyLimitNotExceeded).mockRejectedValue(
        new MockRunnerMonthlyLimitExceededError('Runner monthly limit reached'),
      )

      await expect(
        resolveGenerationRoute('user-1', {
          modelId: 'illustrious-recipe-clone',
        }),
      ).rejects.toThrow(
        expect.objectContaining({ code: 'RUNNER_MONTHLY_LIMIT_EXCEEDED' }),
      )
    })

    it('throws PLATFORM_KEY_MISSING when RUNPOD_KEY is not configured', async () => {
      vi.mocked(getResolvedModelOption).mockResolvedValue(RUNNER_MODEL as never)
      vi.mocked(assertRunnerMonthlyLimitNotExceeded).mockResolvedValue(
        undefined,
      )
      vi.mocked(getSystemApiKey).mockReturnValue(null)

      await expect(
        resolveGenerationRoute('user-1', {
          modelId: 'illustrious-recipe-clone',
        }),
      ).rejects.toThrow(
        expect.objectContaining({ code: 'PLATFORM_KEY_MISSING' }),
      )
    })
  })
})
