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
import {
  AI_ADAPTER_TYPES,
  getDefaultProviderConfig,
} from '@/constants/providers'
import {
  GenerateImageServiceError,
  resolveGenerationRoute,
  resolveImageRouteAndValidate,
} from '@/services/image/generate-image.service'
import {
  findActiveKeyForAdapter,
  getApiKeyValueById,
} from '@/services/apiKey.service'
import { assertRunnerMonthlyLimitNotExceeded } from '@/services/usage.service'
import { getSystemApiKey } from '@/lib/platform-keys'
import { getResolvedModelOption } from '@/services/model-config.service'

// ─── Test Fixtures ─────────────────────────────────────────────

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

  it('throws MISSING_API_KEY when no user key exists (no platform free tier)', async () => {
    // 2026-09-17 owner call: generation has no platform free-tier lane at all.
    // A keyless built-in model falls straight through to the BYOK gate.
    vi.mocked(findActiveKeyForAdapter).mockResolvedValue(null)
    vi.mocked(getSystemApiKey).mockReturnValue('platform-key')

    await expect(
      resolveGenerationRoute('user-1', {
        modelId: 'gemini-3.1-flash-image-preview',
      }),
    ).rejects.toThrow(expect.objectContaining({ code: 'MISSING_API_KEY' }))
    expect(getSystemApiKey).not.toHaveBeenCalled()
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

  it('throws MISSING_API_KEY when no user key is bound', async () => {
    vi.mocked(findActiveKeyForAdapter).mockResolvedValue(null)

    await expect(
      resolveGenerationRoute('user-1', {
        modelId: 'flux-2-pro',
      }),
    ).rejects.toThrow(expect.objectContaining({ code: 'MISSING_API_KEY' }))
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

    it('routes to the system key under the monthly budget cap', async () => {
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

// ─── Seedream 5.0 Pro transparent background (item 63) ──────────
//
// 火山 Ark 文档：`background: "transparent"` 只在 5.0 Pro 上存在，且「仅支持
// 图生图场景，且只支持输入 1 张带透明通道的图片」。校验层管得到前两条前置
// （场景 + 张数），图片本身有没有 alpha 通道只有 provider 判得了。
// https://www.volcengine.com/docs/82379/1541523
describe('resolveImageRouteAndValidate — Seedream transparent background', () => {
  const VOLC_PRO_ROUTE = {
    modelId: AI_MODELS.SEEDREAM_50_PRO_VOLCENGINE,
    externalModelId: 'doubao-seedream-5-0-pro-260628',
    adapterType: AI_ADAPTER_TYPES.VOLCENGINE,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.VOLCENGINE),
    apiKey: 'key',
    creditCost: 2,
  }

  const deps = (route = VOLC_PRO_ROUTE) => ({
    ensureUser: vi.fn().mockResolvedValue({ id: 'user-1' }),
    validatePrompt: vi.fn().mockReturnValue({ valid: true }),
    resolveGenerationRoute: vi.fn().mockResolvedValue(route),
    getProviderAdapter: vi.fn().mockReturnValue({}),
  })

  const request = (overrides: Record<string, unknown>) => ({
    modelId: AI_MODELS.SEEDREAM_50_PRO_VOLCENGINE,
    prompt: 'a cat',
    ...overrides,
  })

  it('accepts a transparent background with exactly one reference image', async () => {
    await expect(
      resolveImageRouteAndValidate(
        'clerk-1',
        request({
          referenceImages: ['https://cdn.example.com/a.png'],
          advancedParams: { background: 'transparent' },
        }) as never,
        deps() as never,
      ),
    ).resolves.toMatchObject({ route: VOLC_PRO_ROUTE })
  })

  // 0 张 = 纯文生图，≥2 张 = 多图生图；文档两种都不允许。
  it.each([
    ['no reference image', [] as string[]],
    ['two reference images', ['https://a/1.png', 'https://a/2.png']],
  ])('rejects a transparent background with %s', async (_label, refs) => {
    await expect(
      resolveImageRouteAndValidate(
        'clerk-1',
        request({
          referenceImages: refs,
          advancedParams: { background: 'transparent' },
        }) as never,
        deps() as never,
      ),
    ).rejects.toThrow(
      expect.objectContaining({
        code: 'VALIDATION_ERROR',
        // ⚠ 原文要与 generation-errors 的那条正则对得上，否则这条错误会掉回
        // 「参考图上限」的通用文案，把人送去删参考图。
        message: expect.stringContaining(
          'Transparent background requires exactly one reference image',
        ),
      }),
    )
  })

  it('leaves an opaque background alone with no reference image', async () => {
    await expect(
      resolveImageRouteAndValidate(
        'clerk-1',
        request({ advancedParams: { background: 'opaque' } }) as never,
        deps() as never,
      ),
    ).resolves.toMatchObject({ route: VOLC_PRO_ROUTE })
  })

  // Lite 的能力表里根本没有 backgroundOptions，所以任何 background 值都该在
  // 值域校验那一关就死掉——不能等到火山返 400。
  it('rejects any background value on Seedream 5.0 Lite', async () => {
    const liteRoute = {
      ...VOLC_PRO_ROUTE,
      modelId: AI_MODELS.SEEDREAM_50_LITE_VOLCENGINE,
      externalModelId: 'doubao-seedream-5-0-lite-260128',
    }
    await expect(
      resolveImageRouteAndValidate(
        'clerk-1',
        request({
          modelId: AI_MODELS.SEEDREAM_50_LITE_VOLCENGINE,
          referenceImages: ['https://cdn.example.com/a.png'],
          advancedParams: { background: 'transparent' },
        }) as never,
        deps(liteRoute) as never,
      ),
    ).rejects.toThrow(
      expect.objectContaining({
        message: 'Unsupported background for the selected model',
      }),
    )
  })
})

// ─── Seedream 5.0 Pro layer decomposition (item 62) ─────────────
//
// 「仅支持输入单张待拆分图，传入多张报错」，且开了 layer_decomposition 之后
// `image` 是必选参数 —— 0 张与 ≥2 张都不成立。
// https://www.volcengine.com/docs/82379/1541523
describe('resolveImageRouteAndValidate — Seedream layer decomposition', () => {
  const VOLC_PRO_ROUTE = {
    modelId: AI_MODELS.SEEDREAM_50_PRO_VOLCENGINE,
    externalModelId: 'doubao-seedream-5-0-pro-260628',
    adapterType: AI_ADAPTER_TYPES.VOLCENGINE,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.VOLCENGINE),
    apiKey: 'key',
    creditCost: 2,
  }

  const deps = (route = VOLC_PRO_ROUTE) => ({
    ensureUser: vi.fn().mockResolvedValue({ id: 'user-1' }),
    validatePrompt: vi.fn().mockReturnValue({ valid: true }),
    resolveGenerationRoute: vi.fn().mockResolvedValue(route),
    getProviderAdapter: vi.fn().mockReturnValue({}),
  })

  const request = (overrides: Record<string, unknown>) => ({
    modelId: AI_MODELS.SEEDREAM_50_PRO_VOLCENGINE,
    prompt: 'split this poster',
    ...overrides,
  })

  it('accepts layer decomposition with exactly one reference image', async () => {
    await expect(
      resolveImageRouteAndValidate(
        'clerk-1',
        request({
          referenceImages: ['https://cdn.example.com/poster.png'],
          advancedParams: { layerDecomposition: true },
        }) as never,
        deps() as never,
      ),
    ).resolves.toMatchObject({ route: VOLC_PRO_ROUTE })
  })

  it.each([
    ['no reference image', [] as string[]],
    ['two reference images', ['https://a/1.png', 'https://a/2.png']],
  ])('rejects layer decomposition with %s', async (_label, refs) => {
    await expect(
      resolveImageRouteAndValidate(
        'clerk-1',
        request({
          referenceImages: refs,
          advancedParams: { layerDecomposition: true },
        }) as never,
        deps() as never,
      ),
    ).rejects.toThrow(
      expect.objectContaining({
        code: 'VALIDATION_ERROR',
        message: expect.stringContaining(
          'Layer decomposition requires exactly one reference image',
        ),
      }),
    )
  })

  // 文档没有写这两颗互斥，所以同时开也必须放行 —— ⛔ 不自造互斥规则。
  it('allows layer decomposition together with a transparent background', async () => {
    await expect(
      resolveImageRouteAndValidate(
        'clerk-1',
        request({
          referenceImages: ['https://cdn.example.com/poster.png'],
          advancedParams: {
            layerDecomposition: true,
            background: 'transparent',
          },
        }) as never,
        deps() as never,
      ),
    ).resolves.toMatchObject({ route: VOLC_PRO_ROUTE })
  })

  it('rejects layer decomposition on Seedream 5.0 Lite', async () => {
    const liteRoute = {
      ...VOLC_PRO_ROUTE,
      modelId: AI_MODELS.SEEDREAM_50_LITE_VOLCENGINE,
      externalModelId: 'doubao-seedream-5-0-lite-260128',
    }
    await expect(
      resolveImageRouteAndValidate(
        'clerk-1',
        request({
          modelId: AI_MODELS.SEEDREAM_50_LITE_VOLCENGINE,
          referenceImages: ['https://cdn.example.com/poster.png'],
          advancedParams: { layerDecomposition: true },
        }) as never,
        deps(liteRoute) as never,
      ),
    ).rejects.toThrow(
      expect.objectContaining({
        message: 'Unsupported layerDecomposition for the selected model',
      }),
    )
  })
})

describe('NovelAI capability gate (slice 26/1)', () => {
  const NAI_V5_ROUTE = {
    modelId: AI_MODELS.NOVELAI_V5_FULL,
    externalModelId: 'nai-diffusion-5-full',
    adapterType: AI_ADAPTER_TYPES.NOVELAI,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.NOVELAI),
    apiKey: 'key',
    creditCost: 2,
  }
  const NAI_V45_ROUTE = {
    ...NAI_V5_ROUTE,
    modelId: AI_MODELS.NOVELAI_V45_FULL,
    externalModelId: 'nai-diffusion-4-5-full',
  }

  const deps = (route: Record<string, unknown>) => ({
    ensureUser: vi.fn().mockResolvedValue({ id: 'user-1' }),
    validatePrompt: vi.fn().mockReturnValue({ valid: true }),
    resolveGenerationRoute: vi.fn().mockResolvedValue(route),
    getProviderAdapter: vi.fn().mockReturnValue({}),
  })

  const run = (
    modelId: string,
    route: Record<string, unknown>,
    advancedParams: Record<string, unknown>,
  ) =>
    resolveImageRouteAndValidate(
      'clerk-1',
      { modelId, prompt: '1girl', advancedParams } as never,
      deps(route) as never,
    )

  it('accepts the three V5 controls on a V5 model', async () => {
    await expect(
      run(AI_MODELS.NOVELAI_V5_FULL, NAI_V5_ROUTE, {
        qualityToggle: 'standard',
        ucPreset: 'heavy',
        textRendering: 'hello',
      }),
    ).resolves.toMatchObject({ route: NAI_V5_ROUTE })
  })

  // V4.5 只声明了 UC 预设 —— 另外两颗必须 400，⛔ 不静默丢弃。
  it.each([
    ['qualityToggle', { qualityToggle: 'standard' }],
    ['textRendering', { textRendering: 'hello' }],
  ])('rejects %s on V4.5', async (field, params) => {
    await expect(
      run(AI_MODELS.NOVELAI_V45_FULL, NAI_V45_ROUTE, params),
    ).rejects.toThrow(
      expect.objectContaining({
        code: 'VALIDATION_ERROR',
        message: `Unsupported ${field} for the selected model`,
      }),
    )
  })

  it('keeps the UC preset available on V4.5', async () => {
    await expect(
      run(AI_MODELS.NOVELAI_V45_FULL, NAI_V45_ROUTE, { ucPreset: 'furry' }),
    ).resolves.toMatchObject({ route: NAI_V45_ROUTE })
  })

  it('rejects the NovelAI-only keys on a non-NovelAI model', async () => {
    const falRoute = {
      modelId: AI_MODELS.FLUX_2_FLASH,
      externalModelId: 'fal-ai/flux-2/flash',
      adapterType: AI_ADAPTER_TYPES.FAL,
      providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
      apiKey: 'key',
      creditCost: 1,
    }
    await expect(
      run(AI_MODELS.FLUX_2_FLASH, falRoute, { ucPreset: 'heavy' }),
    ).rejects.toThrow(
      expect.objectContaining({
        message: 'Unsupported ucPreset for the selected model',
      }),
    )
  })

  it('rejects a Text value over the 750-char cap', async () => {
    await expect(
      run(AI_MODELS.NOVELAI_V5_FULL, NAI_V5_ROUTE, {
        textRendering: 'x'.repeat(751),
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        message: 'Text rendering is limited to 750 characters',
      }),
    )
  })
})
