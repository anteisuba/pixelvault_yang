import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { VISION_NO_CAPABLE_ROUTE_ERROR } from '@/constants/vision'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const mockFindActiveKeyForAdapter = vi.fn()
vi.mock('@/services/apiKey.service', () => ({
  findActiveKeyForAdapter: (...args: unknown[]) =>
    mockFindActiveKeyForAdapter(...args),
}))

const mockGetSystemApiKey = vi.fn()
vi.mock('@/lib/platform-keys', () => ({
  getSystemApiKey: (...args: unknown[]) => mockGetSystemApiKey(...args),
}))

const mockResolveLlmTextRoute = vi.fn()
vi.mock('@/services/llm-text.service', () => ({
  resolveLlmTextRoute: (...args: unknown[]) => mockResolveLlmTextRoute(...args),
}))

import { resolveVisionRoute } from '@/services/vision/vision-route.service'

function keyFor(adapterType: AI_ADAPTER_TYPES) {
  return {
    id: `key_${adapterType}`,
    modelId: 'm',
    adapterType,
    providerConfig: { label: adapterType, baseUrl: 'https://provider.test' },
    label: adapterType,
    keyValue: `${adapterType}-key`,
  }
}

describe('resolveVisionRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindActiveKeyForAdapter.mockResolvedValue(null)
    mockGetSystemApiKey.mockReturnValue(null)
  })

  it('uses the selected route as-is when it can already see images', async () => {
    mockResolveLlmTextRoute.mockResolvedValue({
      adapterType: AI_ADAPTER_TYPES.OPENAI,
      providerConfig: { label: 'OpenAI', baseUrl: 'https://openai.test' },
      apiKey: 'openai-key',
    })

    const resolved = await resolveVisionRoute('db_user_1', 'key_1')

    expect(resolved.borrowed).toBe(false)
    expect(resolved.route.adapterType).toBe(AI_ADAPTER_TYPES.OPENAI)
    // 能看图就别再翻用户的其他 key —— 每次多问一次都是一次多余的解密。
    expect(mockFindActiveKeyForAdapter).not.toHaveBeenCalled()
  })

  it('borrows an image-capable user key when the selected route is text-only', async () => {
    mockResolveLlmTextRoute.mockResolvedValue({
      adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
      providerConfig: { label: 'DeepSeek', baseUrl: 'https://deepseek.test' },
      apiKey: 'deepseek-key',
    })
    mockFindActiveKeyForAdapter.mockImplementation(
      async (_userId: string, adapterType: AI_ADAPTER_TYPES) =>
        adapterType === AI_ADAPTER_TYPES.GEMINI
          ? keyFor(AI_ADAPTER_TYPES.GEMINI)
          : null,
    )

    const resolved = await resolveVisionRoute('db_user_1', 'key_1')

    expect(resolved.borrowed).toBe(true)
    expect(resolved.route.adapterType).toBe(AI_ADAPTER_TYPES.GEMINI)
    expect(resolved.route.apiKey).toBe('gemini-key')
  })

  it('asks Gemini first when the user owns several image-capable keys', async () => {
    // 顺位跟着仓里既有的两处走（`LLM_TEXT_ADAPTERS` 自动回落、
    // `GROUNDING_CAPABLE_ADAPTERS`），平台兜底 key 也是 Gemini —— 三处一致。
    mockResolveLlmTextRoute.mockResolvedValue({
      adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
      providerConfig: { label: 'DeepSeek', baseUrl: 'https://deepseek.test' },
      apiKey: 'deepseek-key',
    })
    mockFindActiveKeyForAdapter.mockImplementation(
      async (_userId: string, adapterType: AI_ADAPTER_TYPES) =>
        keyFor(adapterType),
    )

    const resolved = await resolveVisionRoute('db_user_1', 'key_1')

    expect(resolved.route.adapterType).toBe(AI_ADAPTER_TYPES.GEMINI)
    expect(mockFindActiveKeyForAdapter).toHaveBeenCalledTimes(1)
  })

  it('falls back to the platform key when the user owns no image-capable key', async () => {
    mockResolveLlmTextRoute.mockResolvedValue({
      adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
      providerConfig: { label: 'DeepSeek', baseUrl: 'https://deepseek.test' },
      apiKey: 'deepseek-key',
    })
    mockGetSystemApiKey.mockReturnValue('platform-gemini-key')

    const resolved = await resolveVisionRoute('db_user_1', 'key_1')

    expect(resolved.borrowed).toBe(true)
    expect(resolved.route.adapterType).toBe(AI_ADAPTER_TYPES.GEMINI)
    expect(resolved.route.apiKey).toBe('platform-gemini-key')
  })

  it('throws a structured error instead of guessing when nothing can see images', async () => {
    mockResolveLlmTextRoute.mockResolvedValue({
      adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
      providerConfig: { label: 'DeepSeek', baseUrl: 'https://deepseek.test' },
      apiKey: 'deepseek-key',
    })

    // ⛔ 这里最坏的实现是「借不到就用 DeepSeek 硬跑」—— 会拿到一份格式完整、
    //    根本没看过图的观察。Hard Rule 8：报出可路由到 QuickSetupDialog 的错误码。
    await expect(
      resolveVisionRoute('db_user_1', 'key_1'),
    ).rejects.toMatchObject({
      errorCode: VISION_NO_CAPABLE_ROUTE_ERROR.errorCode,
      httpStatus: VISION_NO_CAPABLE_ROUTE_ERROR.httpStatus,
      i18nKey: VISION_NO_CAPABLE_ROUTE_ERROR.i18nKey,
    })
  })

  it('picks an image-capable route directly when no key was selected', async () => {
    mockFindActiveKeyForAdapter.mockImplementation(
      async (_userId: string, adapterType: AI_ADAPTER_TYPES) =>
        adapterType === AI_ADAPTER_TYPES.GEMINI
          ? keyFor(AI_ADAPTER_TYPES.GEMINI)
          : null,
    )

    const resolved = await resolveVisionRoute('db_user_1')

    // 没选就没有「被借走的那条路」—— 这不是借路，是默认选路。
    expect(resolved.borrowed).toBe(false)
    expect(resolved.route.adapterType).toBe(AI_ADAPTER_TYPES.GEMINI)
    expect(mockResolveLlmTextRoute).not.toHaveBeenCalled()
  })

  it('surfaces a broken selected key instead of silently borrowing around it', async () => {
    // 用户选了一把失效的 key。安静换一把跑完，他会奇怪为什么用的不是自己选的模型，
    // 而那把坏 key 永远不会被修。
    mockResolveLlmTextRoute.mockRejectedValue(
      new Error('The selected API key is unavailable.'),
    )
    mockGetSystemApiKey.mockReturnValue('platform-gemini-key')

    await expect(resolveVisionRoute('db_user_1', 'key_dead')).rejects.toThrow(
      'The selected API key is unavailable.',
    )
  })
})
