import { generateText, type ModelMessage } from 'ai'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ASSISTANT_V3_MAX_OUTPUT_TOKENS } from '@/constants/assistant-v3'
import { AI_PROVIDER_ENDPOINTS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { ResolvedLlmTextRoute } from '@/services/llm-text.service'

vi.mock('server-only', () => ({}))

import {
  assistantV3StepEffort,
  resolveAssistantV3Model,
} from './assistant-v3-model.service'

function route(
  adapterType: AI_ADAPTER_TYPES,
  baseUrl = '',
): ResolvedLlmTextRoute {
  return {
    adapterType,
    apiKey: 'test-key',
    providerConfig: { label: 'test', baseUrl },
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

  it('这一步的档位原样落成各家的参数：Grok / Gemini 同名三档', () => {
    expect(
      resolveAssistantV3Model(
        route(AI_ADAPTER_TYPES.XAI),
        'grok-4.7',
      )?.providerOptions('cache', 'medium'),
    ).toEqual({
      openai: {
        reasoningEffort: 'medium',
        maxCompletionTokens:
          ASSISTANT_V3_MAX_OUTPUT_TOKENS[AI_ADAPTER_TYPES.XAI],
      },
    })
    expect(
      resolveAssistantV3Model(
        route(AI_ADAPTER_TYPES.GEMINI),
        'gemini-3.8-flash',
      )?.providerOptions('cache', 'low'),
    ).toEqual({ google: { thinkingConfig: { thinkingLevel: 'low' } } })
  })

  it('思考档位换成各家原生写法（DeepSeek 没有 medium）', () => {
    const options = (
      adapter: AI_ADAPTER_TYPES,
      modelId: string,
      effort: 'low' | 'medium' | 'high',
    ) =>
      resolveAssistantV3Model(route(adapter), modelId)?.providerOptions(
        'cache',
        effort,
      )
    expect(
      options(AI_ADAPTER_TYPES.ANTHROPIC, 'claude-haiku-5-5', 'high'),
    ).toEqual({
      anthropic: { effort: 'high' },
    })
    expect(
      options(AI_ADAPTER_TYPES.DEEPSEEK, 'deepseek-flash', 'high'),
    ).toEqual({
      openai: { reasoningEffort: 'max' },
    })
    expect(
      options(AI_ADAPTER_TYPES.DEEPSEEK, 'deepseek-flash', 'medium'),
    ).toEqual({
      openai: { reasoningEffort: 'high' },
    })
    expect(options(AI_ADAPTER_TYPES.OPENAI, 'gpt-6.1-sol', 'low')).toEqual({
      openai: { promptCacheKey: 'cache', store: false, reasoningEffort: 'low' },
    })
  })

  it('不在名单上的厂商照走旧内核', () => {
    expect(
      resolveAssistantV3Model(route(AI_ADAPTER_TYPES.NOVELAI), 'x'),
    ).toBeNull()
  })
})

/**
 * 思考档按步调（设计方案 §2.6）：换档赔缓存的两家（Claude、OpenAI 官方）整轮钉住创作者那一档；
 * 别家在纯落地步降到 low。
 */
describe('按步调档', () => {
  it('哪几家能按步换档', () => {
    const perStep = (adapter: AI_ADAPTER_TYPES, modelId: string) =>
      resolveAssistantV3Model(route(adapter), modelId)?.effortPerStep
    expect(perStep(AI_ADAPTER_TYPES.ANTHROPIC, 'claude-opus-5-5')).toBe(false)
    expect(perStep(AI_ADAPTER_TYPES.OPENAI, 'gpt-6.1-sol')).toBe(false)
    expect(perStep(AI_ADAPTER_TYPES.GEMINI, 'gemini-3.8-flash')).toBe(true)
    expect(perStep(AI_ADAPTER_TYPES.DEEPSEEK, 'deepseek-flash')).toBe(true)
    expect(perStep(AI_ADAPTER_TYPES.XAI, 'grok-4.7')).toBe(true)
  })

  it('想事的步用创作者那一档；纯落地步在能换的那几家降到 low', () => {
    const perStep = { effortPerStep: true }
    const pinned = { effortPerStep: false }
    expect(assistantV3StepEffort(perStep, 'high', false)).toBe('high')
    expect(assistantV3StepEffort(perStep, 'high', true)).toBe('low')
    expect(assistantV3StepEffort(perStep, 'medium', true)).toBe('low')
    // ⛔ 永远不高过创作者选的。
    expect(assistantV3StepEffort(perStep, 'low', true)).toBe('low')
    expect(assistantV3StepEffort(perStep, 'low', false)).toBe('low')
    expect(assistantV3StepEffort(pinned, 'high', true)).toBe('high')
  })
})

/**
 * P2 稳定前缀 · Claude 缓存断点：系统提示两块（规则段 / 分界线之后）各一个，历史末尾一个，
 * 最后一条一个 —— 共四个（上限）。别家不打断点，系统提示一整段、规则段在前。
 */
describe('缓存断点', () => {
  const prompt = { rules: 'RULES', creator: '\n\nCREATOR' }
  const conversation = (): ModelMessage[] => [
    { role: 'user', content: 'earlier question' },
    { role: 'assistant', content: 'earlier answer' },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'BOARD' },
        { type: 'text', text: 'THE CREATOR SAYS: hi' },
      ],
    },
    {
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'read',
          input: { cards: [] },
        },
      ],
    },
    {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'call_1',
          toolName: 'read',
          output: { type: 'text', value: 'nothing' },
        },
      ],
    },
  ]
  const ephemeral = { anthropic: { cacheControl: { type: 'ephemeral' } } }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('Claude：规则段、分界线之后、历史末尾、最后一条各一个', () => {
    const model = resolveAssistantV3Model(
      route(AI_ADAPTER_TYPES.ANTHROPIC),
      'claude-opus-5-5',
    )!
    expect(model.system(prompt)).toEqual([
      { role: 'system', content: 'RULES', providerOptions: ephemeral },
      { role: 'system', content: '\n\nCREATOR', providerOptions: ephemeral },
    ])
    const input = conversation()
    const marked = model.messages(input, 2)
    expect(marked.map((message) => message.providerOptions)).toEqual([
      undefined,
      ephemeral,
      undefined,
      undefined,
      ephemeral,
    ])
    // ⛔ 不改调用方那一份（下一步还要用它重拼）。
    expect(input.every((message) => !message.providerOptions)).toBe(true)
  })

  it('Claude：没有历史时只打最后一条；已有的厂商参数保留', () => {
    const model = resolveAssistantV3Model(
      route(AI_ADAPTER_TYPES.ANTHROPIC),
      'claude-opus-5-5',
    )!
    const marked = model.messages(
      [
        {
          role: 'user',
          content: 'hi',
          providerOptions: { anthropic: { foo: 'bar' } },
        },
      ],
      0,
    )
    expect(marked[0]?.providerOptions).toEqual({
      anthropic: { foo: 'bar', cacheControl: { type: 'ephemeral' } },
    })
  })

  it('Claude：发出去的请求里正好四个 cache_control，落在那四处', async () => {
    let body: Record<string, unknown> | null = null
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        body = JSON.parse(String(init?.body)) as Record<string, unknown>
        throw new Error('stop here')
      }),
    )
    const model = resolveAssistantV3Model(
      route(AI_ADAPTER_TYPES.ANTHROPIC),
      'claude-opus-5-5',
    )!
    await expect(
      generateText({
        model: model.model,
        system: model.system(prompt),
        messages: model.messages(conversation(), 2),
        maxRetries: 0,
      }),
    ).rejects.toThrow()
    const sent = JSON.stringify(body)
    expect(sent.match(/"cache_control"/g)).toHaveLength(4)
    const request = body as unknown as {
      system: { text: string; cache_control?: unknown }[]
      messages: {
        role: string
        content: { type: string; cache_control?: unknown }[]
      }[]
    }
    expect(
      request.system.map((block) => [block.text, block.cache_control]),
    ).toEqual([
      ['RULES', { type: 'ephemeral' }],
      ['\n\nCREATOR', { type: 'ephemeral' }],
    ])
    const cached = request.messages.flatMap((message, index) =>
      message.content.flatMap((part) =>
        part.cache_control ? [[index, message.role, part.type]] : [],
      ),
    )
    // 历史末尾（第二条，助手那句）与最后一条（工具结果）。
    expect(cached).toEqual([
      [1, 'assistant', 'text'],
      [4, 'user', 'tool_result'],
    ])
  })

  for (const [adapter, modelId] of [
    [AI_ADAPTER_TYPES.OPENAI, 'gpt-6.1-sol'],
    [AI_ADAPTER_TYPES.GEMINI, 'gemini-3.8-flash'],
    [AI_ADAPTER_TYPES.DEEPSEEK, 'deepseek-flash'],
    [AI_ADAPTER_TYPES.XAI, 'grok-4.7'],
  ] as const)
    it(`${adapter}：不打断点，系统提示一整段、规则段在前`, () => {
      const model = resolveAssistantV3Model(route(adapter), modelId)!
      expect(model.system(prompt)).toBe('RULES\n\nCREATOR')
      const input = conversation()
      expect(model.messages(input, 2)).toEqual(input)
    })
})

/**
 * 主步的输出上限（P2 §2.3，`ASSISTANT_V3_MAX_OUTPUT_TOKENS`）：官方端点按各家的数发；代理端点
 * 不发（上限各不相同）；Grok ⛔ 不发已弃用的 `max_tokens`，同一个数走 `max_completion_tokens`。
 */
describe('输出上限', () => {
  const PROXY = 'https://llm-gateway.example.com/v1'

  it('官方端点：五家各按自己的数（Grok 走 providerOptions）', () => {
    const cap = (adapter: AI_ADAPTER_TYPES, modelId: string) =>
      resolveAssistantV3Model(route(adapter), modelId)?.maxOutputTokens
    expect(cap(AI_ADAPTER_TYPES.ANTHROPIC, 'claude-opus-5-5')).toBe(
      ASSISTANT_V3_MAX_OUTPUT_TOKENS[AI_ADAPTER_TYPES.ANTHROPIC],
    )
    expect(cap(AI_ADAPTER_TYPES.OPENAI, 'gpt-6.1-sol')).toBe(
      ASSISTANT_V3_MAX_OUTPUT_TOKENS[AI_ADAPTER_TYPES.OPENAI],
    )
    expect(cap(AI_ADAPTER_TYPES.GEMINI, 'gemini-3.8-flash')).toBe(
      ASSISTANT_V3_MAX_OUTPUT_TOKENS[AI_ADAPTER_TYPES.GEMINI],
    )
    expect(cap(AI_ADAPTER_TYPES.DEEPSEEK, 'deepseek-flash')).toBe(
      ASSISTANT_V3_MAX_OUTPUT_TOKENS[AI_ADAPTER_TYPES.DEEPSEEK],
    )
    expect(cap(AI_ADAPTER_TYPES.XAI, 'grok-4.7')).toBeUndefined()
    expect(
      resolveAssistantV3Model(
        route(AI_ADAPTER_TYPES.XAI, AI_PROVIDER_ENDPOINTS.XAI),
        'grok-4.7',
      )?.providerOptions('cache', 'low').openai?.maxCompletionTokens,
    ).toBe(ASSISTANT_V3_MAX_OUTPUT_TOKENS[AI_ADAPTER_TYPES.XAI])
  })

  it('代理端点：不发（Claude 例外：max_tokens 必填）', () => {
    const cap = (adapter: AI_ADAPTER_TYPES, modelId: string) =>
      resolveAssistantV3Model(route(adapter, PROXY), modelId)
    expect(cap(AI_ADAPTER_TYPES.OPENAI, 'gpt-6.1-sol')?.maxOutputTokens).toBe(
      undefined,
    )
    expect(
      cap(AI_ADAPTER_TYPES.DEEPSEEK, 'deepseek-flash')?.maxOutputTokens,
    ).toBeUndefined()
    expect(
      cap(AI_ADAPTER_TYPES.XAI, 'grok-4.7')?.providerOptions('cache', 'low'),
    ).toEqual({ openai: { reasoningEffort: 'low' } })
    expect(
      cap(AI_ADAPTER_TYPES.ANTHROPIC, 'claude-opus-5-5')?.maxOutputTokens,
    ).toBe(ASSISTANT_V3_MAX_OUTPUT_TOKENS[AI_ADAPTER_TYPES.ANTHROPIC])
  })

  it('Grok 发出去的请求里 ⛔ 没有 max_tokens，只有 max_completion_tokens', async () => {
    let body: Record<string, unknown> | null = null
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        body = JSON.parse(String(init?.body)) as Record<string, unknown>
        throw new Error('stop here')
      }),
    )
    const model = resolveAssistantV3Model(
      route(AI_ADAPTER_TYPES.XAI),
      'grok-4.7',
    )!
    await expect(
      generateText({
        model: model.model,
        prompt: 'hi',
        maxRetries: 0,
        ...(model.maxOutputTokens === undefined
          ? {}
          : { maxOutputTokens: model.maxOutputTokens }),
        providerOptions: model.providerOptions('cache', 'low'),
      }),
    ).rejects.toThrow()
    vi.unstubAllGlobals()
    expect(body).not.toHaveProperty('max_tokens')
    expect(body).toHaveProperty(
      'max_completion_tokens',
      ASSISTANT_V3_MAX_OUTPUT_TOKENS[AI_ADAPTER_TYPES.XAI],
    )
  })
})
