import type { ReactNode } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { waitFor } from '@testing-library/react'

import { LLM_TEXT_MODEL_IDS } from '@/constants/config'
import { AI_ADAPTER_TYPES, type ProviderConfig } from '@/constants/providers'
import { useLLMRoutePicker } from '@/hooks/use-llm-route-picker'
import type { UserApiKeyRecord } from '@/types'

/** 服务端那边她有哪几把 key（真 `ApiKeysProvider` 经 api-client 拉）。 */
const server = vi.hoisted(() => ({ keys: [] as unknown[], userSeq: 0 }))
vi.mock('@/lib/api-client', () => ({
  listApiKeys: vi.fn(async () => ({ success: true, data: server.keys })),
  createApiKey: vi.fn(),
  updateApiKey: vi.fn(),
  deleteApiKey: vi.fn(),
  verifyApiKey: vi.fn(),
}))
// ⚠ 名单缓存按用户存：每个用例换一个 userId，免得读到上一个的缓存。
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({
    userId: `user-${server.userSeq}`,
    isLoaded: true,
    isSignedIn: true,
  }),
}))
vi.stubGlobal('requestIdleCallback', (task: () => void) => {
  task()
  return 1
})
vi.stubGlobal('cancelIdleCallback', () => {})

import { ApiKeysProvider, useApiKeysContext } from '@/contexts/api-keys-context'
import { renderHookWithApp } from '@/test/app-harness'

function Keys({ children }: { children: ReactNode }) {
  return <ApiKeysProvider>{children}</ApiKeysProvider>
}

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

function givenKeys(keys: UserApiKeyRecord[]) {
  server.keys = keys
  server.userSeq += 1
}

/** 真 Provider 拉完名单之后的选择器。 */
async function renderPicker(scope: Parameters<typeof useLLMRoutePicker>[0]) {
  const rendered = renderHookWithApp(
    () => ({ picker: useLLMRoutePicker(scope), keys: useApiKeysContext() }),
    { inner: Keys },
  )
  await waitFor(() => expect(rendered.result.current.keys.hasLoaded).toBe(true))
  return {
    result: {
      get current() {
        return rendered.result.current.picker
      },
    },
    context: () => rendered.result.current.keys,
  }
}

describe('useLLMRoutePicker', () => {
  describe('enhance scope', () => {
    it('returns saved routes for enhance-capable text keys (OPENAI/GEMINI)', async () => {
      givenKeys([
        makeKey({ id: 'k1', adapterType: AI_ADAPTER_TYPES.OPENAI }),
        makeKey({ id: 'k2', adapterType: AI_ADAPTER_TYPES.GEMINI }),
        makeKey({ id: 'k3', adapterType: AI_ADAPTER_TYPES.VOLCENGINE }),
      ])
      const { result } = await renderPicker('enhance')
      // One key × N registry tiers → N options (OpenAI 4, Gemini 3).
      expect(result.current.savedRoutes.map((r) => r.apiKeyId)).toEqual([
        'k1',
        'k1',
        'k1',
        'k1',
        'k2',
        'k2',
        'k2',
      ])
    })

    it('filters out DeepSeek keys (not enhance-capable per current behavior)', async () => {
      givenKeys([
        makeKey({ id: 'k1', adapterType: AI_ADAPTER_TYPES.OPENAI }),
        makeKey({ id: 'k2', adapterType: AI_ADAPTER_TYPES.DEEPSEEK }),
      ])
      const { result } = await renderPicker('enhance')
      expect(result.current.savedRoutes.map((r) => r.apiKeyId)).toEqual([
        'k1',
        'k1',
        'k1',
        'k1',
      ])
    })

    it('filters out inactive keys', async () => {
      givenKeys([
        makeKey({
          id: 'k1',
          adapterType: AI_ADAPTER_TYPES.OPENAI,
          isActive: false,
        }),
      ])
      const { result } = await renderPicker('enhance')
      expect(result.current.savedRoutes).toEqual([])
    })

    it('locked routes list enhance-capable text models with registry modelIds', async () => {
      givenKeys([])
      const { result } = await renderPicker('enhance')
      const adapters = result.current.lockedRoutes.map((r) => r.adapterType)
      expect([...new Set(adapters)].sort()).toEqual(
        [
          AI_ADAPTER_TYPES.GEMINI,
          AI_ADAPTER_TYPES.OPENAI,
          AI_ADAPTER_TYPES.XAI,
        ].sort(),
      )
      expect(result.current.lockedRoutes.every((r) => r.modelId)).toBe(true)
      expect(result.current.lockedRoutes.map((r) => r.label).sort()).toEqual(
        [
          'OpenAI GPT-6 Luna',
          'OpenAI GPT-6.1 Sol',
          'OpenAI GPT-6.1 Terra',
          'OpenAI GPT-6 Astra',
          'Gemini 3.5 Flash Lite',
          'Gemini 3.8 Flash',
          'Gemini 4 Argon',
          'Grok 4.7',
        ].sort(),
      )
    })
  })

  describe('planner scope', () => {
    it('returns saved routes for planner-capable keys (OPENAI/GEMINI/DEEPSEEK)', async () => {
      givenKeys([
        makeKey({ id: 'k1', adapterType: AI_ADAPTER_TYPES.OPENAI }),
        makeKey({ id: 'k2', adapterType: AI_ADAPTER_TYPES.DEEPSEEK }),
        makeKey({ id: 'k3', adapterType: AI_ADAPTER_TYPES.VOLCENGINE }),
      ])
      const { result } = await renderPicker('planner')
      expect(result.current.savedRoutes.map((r) => r.apiKeyId)).toEqual([
        'k1',
        'k2',
      ])
    })

    it('saved routes carry modelId from SCRIPT_PLANNER_MODELS registry', async () => {
      givenKeys([makeKey({ id: 'k1', adapterType: AI_ADAPTER_TYPES.OPENAI })])
      const { result } = await renderPicker('planner')
      expect(result.current.savedRoutes[0].modelId).toBeDefined()
      expect(result.current.savedRoutes[0].label).toBe('OpenAI GPT-6.1 Sol')
    })

    it('locked routes list all planner-capable adapters with registry data', async () => {
      givenKeys([])
      const { result } = await renderPicker('planner')
      expect(result.current.lockedRoutes.length).toBe(3)
      expect(result.current.lockedRoutes.every((r) => r.modelId)).toBe(true)
    })
  })

  describe('assistant scope', () => {
    it('returns only saved routes present in the assistant registry', async () => {
      givenKeys([
        makeKey({ id: 'k1', adapterType: AI_ADAPTER_TYPES.GEMINI }),
        makeKey({ id: 'k2', adapterType: AI_ADAPTER_TYPES.OPENAI }),
        makeKey({ id: 'k4', adapterType: AI_ADAPTER_TYPES.DEEPSEEK }),
        makeKey({ id: 'k6', adapterType: AI_ADAPTER_TYPES.HUGGINGFACE }),
        makeKey({ id: 'k5', adapterType: AI_ADAPTER_TYPES.ANTHROPIC }),
      ])
      const { result } = await renderPicker('assistant')
      // Gemini two tiers (4 Argon since 11-01), OpenAI four (6.1 Terra since
      // 11-01), Claude four (Haiku 5.5 since 10-10); DeepSeek two.
      expect(result.current.savedRoutes.map((r) => r.apiKeyId)).toEqual([
        'k1',
        'k1',
        'k2',
        'k2',
        'k2',
        'k2',
        'k4',
        'k4',
        'k5',
        'k5',
        'k5',
        'k5',
      ])
    })

    it('saved routes carry modelId from NODE_STUDIO_ASSISTANT_ROUTE_MODELS', async () => {
      givenKeys([makeKey({ id: 'k1', adapterType: AI_ADAPTER_TYPES.GEMINI })])
      const { result } = await renderPicker('assistant')
      expect(result.current.savedRoutes[0].modelId).toBeDefined()
      expect(result.current.savedRoutes[0].label).toBe('Gemini 3.8 Flash')
    })

    it('offers OpenAI, Gemini, DeepSeek, Claude, and Grok setup rows', async () => {
      givenKeys([])
      const { result } = await renderPicker('assistant')
      expect(
        result.current.lockedRoutes.map((route) => route.adapterType),
      ).toEqual([
        AI_ADAPTER_TYPES.OPENAI,
        AI_ADAPTER_TYPES.OPENAI,
        AI_ADAPTER_TYPES.OPENAI,
        AI_ADAPTER_TYPES.OPENAI,
        AI_ADAPTER_TYPES.GEMINI,
        AI_ADAPTER_TYPES.GEMINI,
        AI_ADAPTER_TYPES.DEEPSEEK,
        AI_ADAPTER_TYPES.DEEPSEEK,
        AI_ADAPTER_TYPES.ANTHROPIC,
        AI_ADAPTER_TYPES.ANTHROPIC,
        AI_ADAPTER_TYPES.ANTHROPIC,
        AI_ADAPTER_TYPES.ANTHROPIC,
        AI_ADAPTER_TYPES.XAI,
      ])
    })

    it('offers Sonnet 5.5 through the existing Claude key', async () => {
      givenKeys([
        makeKey({ id: 'claude-key', adapterType: AI_ADAPTER_TYPES.ANTHROPIC }),
      ])
      const { result } = await renderPicker('assistant')
      expect(result.current.savedRoutes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            modelId: LLM_TEXT_MODEL_IDS.CLAUDE_SONNET_5_5,
            apiKeyId: 'claude-key',
            label: 'Claude Sonnet 5.5',
            adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
          }),
        ]),
      )
      expect(result.current.savedRoutes[0]?.modelId).toBe(
        LLM_TEXT_MODEL_IDS.CLAUDE_OPUS_5_5,
      )
    })
  })

  it.each(['enhance', 'assistant'] as const)(
    'exposes GPT-6 with the saved OpenAI key in %s',
    async (scope) => {
      givenKeys([
        makeKey({ id: 'openai-key', adapterType: AI_ADAPTER_TYPES.OPENAI }),
      ])
      const { result } = await renderPicker(scope)
      expect(result.current.savedRoutes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            modelId: 'gpt-6-astra',
            apiKeyId: 'openai-key',
            label: 'OpenAI GPT-6 Astra',
          }),
        ]),
      )
    },
  )

  describe('common behavior', () => {
    it('allRoutes equals savedRoutes + lockedRoutes', async () => {
      givenKeys([makeKey({ id: 'k1', adapterType: AI_ADAPTER_TYPES.OPENAI })])
      const { result } = await renderPicker('planner')
      expect(result.current.allRoutes).toEqual([
        ...result.current.savedRoutes,
        ...result.current.lockedRoutes,
      ])
    })

    it('health 原样用 key 名单那一份', async () => {
      givenKeys([makeKey({ id: 'k1', adapterType: AI_ADAPTER_TYPES.OPENAI })])
      const { result, context } = await renderPicker('planner')
      expect(result.current.healthMap).toBe(context().healthMap)
      expect(result.current.healthMap).toHaveProperty('k1')
    })

    it('saved routes use unique optionId per key', async () => {
      givenKeys([
        makeKey({ id: 'k1', adapterType: AI_ADAPTER_TYPES.OPENAI }),
        makeKey({
          id: 'k2',
          adapterType: AI_ADAPTER_TYPES.OPENAI,
          label: 'Second OpenAI key',
        }),
      ])
      const { result } = await renderPicker('planner')
      const optionIds = result.current.savedRoutes.map((r) => r.optionId)
      expect(new Set(optionIds).size).toBe(optionIds.length)
    })

    it('locked routes have apiKeyId = null', async () => {
      givenKeys([])
      const { result } = await renderPicker('planner')
      expect(
        result.current.lockedRoutes.every((r) => r.apiKeyId === null),
      ).toBe(true)
    })

    it('saved routes have isSaved = true; locked routes have isSaved = false', async () => {
      givenKeys([makeKey({ id: 'k1', adapterType: AI_ADAPTER_TYPES.OPENAI })])
      const { result } = await renderPicker('planner')
      expect(result.current.savedRoutes.every((r) => r.isSaved)).toBe(true)
      expect(result.current.lockedRoutes.every((r) => !r.isSaved)).toBe(true)
    })
  })
})
