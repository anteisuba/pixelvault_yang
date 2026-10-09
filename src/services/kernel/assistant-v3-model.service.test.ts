import { describe, expect, it, vi } from 'vitest'

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { ResolvedLlmTextRoute } from '@/services/llm-text.service'

vi.mock('server-only', () => ({}))

import { resolveAssistantV3Model } from './assistant-v3-model.service'

function route(adapterType: AI_ADAPTER_TYPES): ResolvedLlmTextRoute {
  return {
    adapterType,
    apiKey: 'test-key',
    providerConfig: { label: 'test', baseUrl: '' },
  } as unknown as ResolvedLlmTextRoute
}

/** 2026-10-10：助手路由上的五家都要进得了 v3（此前 DeepSeek / Grok 退回旧内核）。 */
describe('resolveAssistantV3Model', () => {
  it('DeepSeek 走兼容 OpenAI 的对话接口', () => {
    const model = resolveAssistantV3Model(
      route(AI_ADAPTER_TYPES.DEEPSEEK),
      'deepseek-flash',
    )
    expect(model).not.toBeNull()
    expect(model?.strictTools).toBe(false)
  })

  it('默认 Medium：Grok / Gemini 都取 medium', () => {
    expect(
      resolveAssistantV3Model(
        route(AI_ADAPTER_TYPES.XAI),
        'grok-4.7',
      )?.providerOptions('cache'),
    ).toEqual({ openai: { reasoningEffort: 'medium' } })
    expect(
      resolveAssistantV3Model(
        route(AI_ADAPTER_TYPES.GEMINI),
        'gemini-3.8-flash',
      )?.providerOptions('cache'),
    ).toEqual({ google: { thinkingConfig: { thinkingLevel: 'medium' } } })
  })

  it('思考档位换成各家原生写法（DeepSeek 没有 medium）', () => {
    const options = (adapter: AI_ADAPTER_TYPES, modelId: string) =>
      resolveAssistantV3Model(route(adapter), modelId, 'high')?.providerOptions(
        'cache',
      )
    expect(options(AI_ADAPTER_TYPES.ANTHROPIC, 'claude-haiku-5-5')).toEqual({
      anthropic: { effort: 'high' },
    })
    expect(options(AI_ADAPTER_TYPES.DEEPSEEK, 'deepseek-flash')).toEqual({
      openai: { reasoningEffort: 'max' },
    })
    expect(
      resolveAssistantV3Model(
        route(AI_ADAPTER_TYPES.DEEPSEEK),
        'deepseek-flash',
      )?.providerOptions('cache'),
    ).toEqual({ openai: { reasoningEffort: 'high' } })
  })

  it('不在名单上的厂商照走旧内核', () => {
    expect(
      resolveAssistantV3Model(route(AI_ADAPTER_TYPES.NOVELAI), 'x'),
    ).toBeNull()
  })
})
