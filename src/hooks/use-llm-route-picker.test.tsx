import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

import { AI_ADAPTER_TYPES, type ProviderConfig } from '@/constants/providers'
import { useLLMRoutePicker } from '@/hooks/use-llm-route-picker'
import type { ApiKeyHealthStatus, UserApiKeyRecord } from '@/types'

vi.mock('@/contexts/api-keys-context', () => ({
  useApiKeysContext: vi.fn(),
}))

import { useApiKeysContext } from '@/contexts/api-keys-context'

function makeKey(overrides: Partial<UserApiKeyRecord>): UserApiKeyRecord {
  const providerConfig: ProviderConfig = {
    label: `${overrides.adapterType ?? 'openai'}-label`,
    baseUrl: 'https://example.com',
  }
  return {
    id: overrides.id ?? 'key-1',
    modelId: overrides.modelId ?? 'model-1',
    adapterType: overrides.adapterType ?? AI_ADAPTER_TYPES.OPENAI,
    providerConfig,
    label: overrides.label ?? 'My OpenAI key',
    maskedKey: overrides.maskedKey ?? 'sk-****1234',
    isActive: overrides.isActive ?? true,
    createdAt: overrides.createdAt ?? new Date('2026-01-01'),
  }
}

function mockApiKeys(
  keys: UserApiKeyRecord[],
  healthMap: Record<string, ApiKeyHealthStatus> = {},
) {
  vi.mocked(useApiKeysContext).mockReturnValue({
    keys,
    healthMap,
    isLoading: false,
  } as ReturnType<typeof useApiKeysContext>)
}

describe('useLLMRoutePicker', () => {
  describe('enhance scope', () => {
    it('returns saved routes for enhance-capable keys (OPENAI/GEMINI/VOLCENGINE)', () => {
      mockApiKeys([
        makeKey({ id: 'k1', adapterType: AI_ADAPTER_TYPES.OPENAI }),
        makeKey({ id: 'k2', adapterType: AI_ADAPTER_TYPES.GEMINI }),
        makeKey({ id: 'k3', adapterType: AI_ADAPTER_TYPES.VOLCENGINE }),
      ])
      const { result } = renderHook(() => useLLMRoutePicker('enhance'))
      expect(result.current.savedRoutes.map((r) => r.apiKeyId)).toEqual([
        'k1',
        'k2',
        'k3',
      ])
    })

    it('filters out DeepSeek keys (not enhance-capable per current behavior)', () => {
      mockApiKeys([
        makeKey({ id: 'k1', adapterType: AI_ADAPTER_TYPES.OPENAI }),
        makeKey({ id: 'k2', adapterType: AI_ADAPTER_TYPES.DEEPSEEK }),
      ])
      const { result } = renderHook(() => useLLMRoutePicker('enhance'))
      expect(result.current.savedRoutes.map((r) => r.apiKeyId)).toEqual(['k1'])
    })

    it('filters out inactive keys', () => {
      mockApiKeys([
        makeKey({
          id: 'k1',
          adapterType: AI_ADAPTER_TYPES.OPENAI,
          isActive: false,
        }),
      ])
      const { result } = renderHook(() => useLLMRoutePicker('enhance'))
      expect(result.current.savedRoutes).toEqual([])
    })

    it('locked routes list enhance-capable adapters even without registry modelId', () => {
      mockApiKeys([])
      const { result } = renderHook(() => useLLMRoutePicker('enhance'))
      const adapters = result.current.lockedRoutes.map((r) => r.adapterType)
      expect(adapters.sort()).toEqual(
        [
          AI_ADAPTER_TYPES.GEMINI,
          AI_ADAPTER_TYPES.OPENAI,
          AI_ADAPTER_TYPES.VOLCENGINE,
        ].sort(),
      )
      // enhance scope has no registry — modelId undefined
      expect(result.current.lockedRoutes.every((r) => !r.modelId)).toBe(true)
    })
  })

  describe('planner scope', () => {
    it('returns saved routes for planner-capable keys (OPENAI/GEMINI/DEEPSEEK)', () => {
      mockApiKeys([
        makeKey({ id: 'k1', adapterType: AI_ADAPTER_TYPES.OPENAI }),
        makeKey({ id: 'k2', adapterType: AI_ADAPTER_TYPES.DEEPSEEK }),
        makeKey({ id: 'k3', adapterType: AI_ADAPTER_TYPES.VOLCENGINE }),
      ])
      const { result } = renderHook(() => useLLMRoutePicker('planner'))
      expect(result.current.savedRoutes.map((r) => r.apiKeyId)).toEqual([
        'k1',
        'k2',
      ])
    })

    it('saved routes carry modelId from SCRIPT_PLANNER_MODELS registry', () => {
      mockApiKeys([makeKey({ id: 'k1', adapterType: AI_ADAPTER_TYPES.OPENAI })])
      const { result } = renderHook(() => useLLMRoutePicker('planner'))
      expect(result.current.savedRoutes[0].modelId).toBeDefined()
      expect(result.current.savedRoutes[0].label).toBe('OpenAI')
    })

    it('locked routes list all planner-capable adapters with registry data', () => {
      mockApiKeys([])
      const { result } = renderHook(() => useLLMRoutePicker('planner'))
      expect(result.current.lockedRoutes.length).toBe(3)
      expect(result.current.lockedRoutes.every((r) => r.modelId)).toBe(true)
    })
  })

  describe('assistant scope', () => {
    it('returns saved routes for assistant-capable keys (OPENAI/GEMINI/DEEPSEEK)', () => {
      mockApiKeys([
        makeKey({ id: 'k1', adapterType: AI_ADAPTER_TYPES.GEMINI }),
        makeKey({ id: 'k2', adapterType: AI_ADAPTER_TYPES.OPENAI }),
        makeKey({ id: 'k3', adapterType: AI_ADAPTER_TYPES.FAL }),
      ])
      const { result } = renderHook(() => useLLMRoutePicker('assistant'))
      expect(result.current.savedRoutes.map((r) => r.apiKeyId)).toEqual([
        'k1',
        'k2',
      ])
    })

    it('saved routes carry modelId from NODE_STUDIO_ASSISTANT_ROUTE_MODELS', () => {
      mockApiKeys([makeKey({ id: 'k1', adapterType: AI_ADAPTER_TYPES.GEMINI })])
      const { result } = renderHook(() => useLLMRoutePicker('assistant'))
      expect(result.current.savedRoutes[0].modelId).toBeDefined()
      expect(result.current.savedRoutes[0].label).toBe('Gemini')
    })
  })

  describe('common behavior', () => {
    it('allRoutes equals savedRoutes + lockedRoutes', () => {
      mockApiKeys([makeKey({ id: 'k1', adapterType: AI_ADAPTER_TYPES.OPENAI })])
      const { result } = renderHook(() => useLLMRoutePicker('planner'))
      expect(result.current.allRoutes).toEqual([
        ...result.current.savedRoutes,
        ...result.current.lockedRoutes,
      ])
    })

    it('passes healthMap through unchanged', () => {
      const healthMap: Record<string, ApiKeyHealthStatus> = {
        k1: 'available',
        k2: 'failed',
      }
      mockApiKeys(
        [makeKey({ id: 'k1', adapterType: AI_ADAPTER_TYPES.OPENAI })],
        healthMap,
      )
      const { result } = renderHook(() => useLLMRoutePicker('planner'))
      expect(result.current.healthMap).toBe(healthMap)
    })

    it('saved routes use unique optionId per key', () => {
      mockApiKeys([
        makeKey({ id: 'k1', adapterType: AI_ADAPTER_TYPES.OPENAI }),
        makeKey({
          id: 'k2',
          adapterType: AI_ADAPTER_TYPES.OPENAI,
          label: 'Second OpenAI key',
        }),
      ])
      const { result } = renderHook(() => useLLMRoutePicker('planner'))
      const optionIds = result.current.savedRoutes.map((r) => r.optionId)
      expect(new Set(optionIds).size).toBe(optionIds.length)
    })

    it('locked routes have apiKeyId = null', () => {
      mockApiKeys([])
      const { result } = renderHook(() => useLLMRoutePicker('planner'))
      expect(
        result.current.lockedRoutes.every((r) => r.apiKeyId === null),
      ).toBe(true)
    })

    it('saved routes have isSaved = true; locked routes have isSaved = false', () => {
      mockApiKeys([makeKey({ id: 'k1', adapterType: AI_ADAPTER_TYPES.OPENAI })])
      const { result } = renderHook(() => useLLMRoutePicker('planner'))
      expect(result.current.savedRoutes.every((r) => r.isSaved)).toBe(true)
      expect(result.current.lockedRoutes.every((r) => !r.isSaved)).toBe(true)
    })
  })
})
