import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const findActiveKeyForAdapter = vi.hoisted(() =>
  vi.fn(async (_userId: string, adapterType: string) =>
    adapterType === 'gemini'
      ? {
          id: 'key-gemini',
          adapterType: 'gemini',
          providerConfig: { label: 'Gemini', baseUrl: 'https://g.test' },
          keyValue: 'g-key',
        }
      : null,
  ),
)
vi.mock('@/services/apiKey.service', () => ({
  findActiveKeyForAdapter: (...args: [string, string]) =>
    findActiveKeyForAdapter(...args),
}))

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { findFallbackAssistantRoute } from './assistant-fallback-route.service'

describe('findFallbackAssistantRoute', () => {
  it('skips the adapter that failed and returns the first key the user has', async () => {
    const alt = await findFallbackAssistantRoute('user-1', AI_ADAPTER_TYPES.XAI)
    expect(alt).toMatchObject({
      route: { adapterType: 'gemini', apiKey: 'g-key' },
      modelId: expect.any(String),
    })
    // 顺序表里排在 Gemini 前面的两家都问过（没 key），⛔ 不问出事的那家。
    expect(findActiveKeyForAdapter.mock.calls.map(([, a]) => a)).toEqual([
      AI_ADAPTER_TYPES.OPENAI,
      AI_ADAPTER_TYPES.ANTHROPIC,
      AI_ADAPTER_TYPES.GEMINI,
    ])
  })

  it('returns null when the only key is the one that failed', async () => {
    findActiveKeyForAdapter.mockClear()
    expect(
      await findFallbackAssistantRoute('user-1', AI_ADAPTER_TYPES.GEMINI),
    ).toBeNull()
  })

  it('with images on the step, only borrows a route that can see them', async () => {
    findActiveKeyForAdapter.mockClear()
    findActiveKeyForAdapter.mockImplementation(async (_u, adapterType) =>
      adapterType === 'deepseek' || adapterType === 'gemini'
        ? {
            id: `key-${adapterType}`,
            adapterType,
            providerConfig: { label: adapterType, baseUrl: 'https://x.test' },
            keyValue: `${adapterType}-key`,
          }
        : null,
    )
    const alt = await findFallbackAssistantRoute(
      'user-1',
      AI_ADAPTER_TYPES.XAI,
      { needsImages: true },
    )
    expect(alt?.route.adapterType).toBe('gemini')
  })
})
