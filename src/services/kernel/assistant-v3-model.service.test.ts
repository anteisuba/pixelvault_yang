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

  it('Grok 带 low 推理强度（关不掉的推理默认 high，首字前想太久会断线）', () => {
    const model = resolveAssistantV3Model(
      route(AI_ADAPTER_TYPES.XAI),
      'grok-4.7',
    )
    expect(model?.providerOptions('cache')).toEqual({
      openai: { reasoningEffort: 'low' },
    })
  })

  it('Gemini 取 medium 思考档（默认最高档一步想 46 秒）', () => {
    const model = resolveAssistantV3Model(
      route(AI_ADAPTER_TYPES.GEMINI),
      'gemini-3.8-flash',
    )
    expect(model?.providerOptions('cache')).toEqual({
      google: { thinkingConfig: { thinkingLevel: 'medium' } },
    })
  })

  it('不在名单上的厂商照走旧内核', () => {
    expect(
      resolveAssistantV3Model(route(AI_ADAPTER_TYPES.NOVELAI), 'x'),
    ).toBeNull()
  })
})
