import { generateText, type ModelMessage } from 'ai'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  ASSISTANT_V3_MAX_OUTPUT_TOKENS,
  assistantV3VerifiedOutputCap,
} from '@/constants/assistant-v3'
import { AI_PROVIDER_ENDPOINTS } from '@/constants/config'
import { NODE_STUDIO_ASSISTANT_ROUTE_MODELS } from '@/constants/node-studio'
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
        maxCompletionTokens: ASSISTANT_V3_MAX_OUTPUT_TOKENS.cap,
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

/** 拦下发出去的请求体（在 fetch 那一层停住，⛔ 不真发）。 */
async function sentBody(
  adapter: AI_ADAPTER_TYPES,
  modelId: string,
  baseUrl = '',
): Promise<Record<string, unknown>> {
  let body: Record<string, unknown> = {}
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>
      throw new Error('stop here')
    }),
  )
  const model = resolveAssistantV3Model(route(adapter, baseUrl), modelId)!
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
  return body
}

/**
 * 主步的输出上限（P2 §2.3，`ASSISTANT_V3_MAX_OUTPUT_TOKENS`）。协调者的决定 C：⛔ 拿创作者的主模型
 * 冒 400 的险 —— 只在官方端点、官方上限登记过且 ≥ 那个数的型号上发；Claude 例外（必填）。
 */
describe('输出上限', () => {
  const PROXY = 'https://llm-gateway.example.com/v1'
  const { cap } = ASSISTANT_V3_MAX_OUTPUT_TOKENS

  it('登记的每个官方上限都 ≥ 发的那个数；助手路由上的每个型号都登记过', () => {
    for (const documented of Object.values(
      ASSISTANT_V3_MAX_OUTPUT_TOKENS.documentedMax,
    ))
      expect(documented).toBeGreaterThanOrEqual(cap)
    for (const { modelId } of NODE_STUDIO_ASSISTANT_ROUTE_MODELS)
      expect(assistantV3VerifiedOutputCap(modelId), modelId).toBe(cap)
  })

  it('官方端点：登记过的型号发（Grok 走 providerOptions）', () => {
    const sent = (adapter: AI_ADAPTER_TYPES, modelId: string) =>
      resolveAssistantV3Model(route(adapter), modelId)?.maxOutputTokens
    expect(sent(AI_ADAPTER_TYPES.ANTHROPIC, 'claude-opus-5-5')).toBe(
      ASSISTANT_V3_MAX_OUTPUT_TOKENS.anthropic,
    )
    expect(sent(AI_ADAPTER_TYPES.OPENAI, 'gpt-6.1-sol')).toBe(cap)
    expect(sent(AI_ADAPTER_TYPES.GEMINI, 'gemini-3.8-flash')).toBe(cap)
    expect(sent(AI_ADAPTER_TYPES.DEEPSEEK, 'deepseek-flash')).toBe(cap)
    expect(sent(AI_ADAPTER_TYPES.DEEPSEEK, 'deepseek-v4-pro')).toBe(cap)
    expect(sent(AI_ADAPTER_TYPES.XAI, 'grok-4.7')).toBeUndefined()
    expect(
      resolveAssistantV3Model(
        route(AI_ADAPTER_TYPES.XAI, AI_PROVIDER_ENDPOINTS.XAI),
        'grok-4.7',
      )?.providerOptions('cache', 'low').openai?.maxCompletionTokens,
    ).toBe(cap)
  })

  it('官方端点上没登记的型号：不发（Claude 例外）', () => {
    const sent = (adapter: AI_ADAPTER_TYPES, modelId: string) =>
      resolveAssistantV3Model(route(adapter), modelId)
    expect(
      sent(AI_ADAPTER_TYPES.OPENAI, 'gpt-7-preview')?.maxOutputTokens,
    ).toBeUndefined()
    expect(
      sent(AI_ADAPTER_TYPES.GEMINI, 'gemini-4-flash')?.maxOutputTokens,
    ).toBeUndefined()
    expect(
      sent(AI_ADAPTER_TYPES.DEEPSEEK, 'deepseek-v5')?.maxOutputTokens,
    ).toBeUndefined()
    expect(
      sent(AI_ADAPTER_TYPES.XAI, 'grok-5')?.providerOptions('cache', 'low'),
    ).toEqual({ openai: { reasoningEffort: 'low' } })
    expect(
      sent(AI_ADAPTER_TYPES.ANTHROPIC, 'claude-next')?.maxOutputTokens,
    ).toBe(ASSISTANT_V3_MAX_OUTPUT_TOKENS.anthropic)
  })

  it('代理端点：不发（Claude 例外：max_tokens 必填）', () => {
    const sent = (adapter: AI_ADAPTER_TYPES, modelId: string) =>
      resolveAssistantV3Model(route(adapter, PROXY), modelId)
    expect(
      sent(AI_ADAPTER_TYPES.OPENAI, 'gpt-6.1-sol')?.maxOutputTokens,
    ).toBeUndefined()
    expect(
      sent(AI_ADAPTER_TYPES.DEEPSEEK, 'deepseek-flash')?.maxOutputTokens,
    ).toBeUndefined()
    expect(
      sent(AI_ADAPTER_TYPES.XAI, 'grok-4.7')?.providerOptions('cache', 'low'),
    ).toEqual({ openai: { reasoningEffort: 'low' } })
    expect(
      sent(AI_ADAPTER_TYPES.ANTHROPIC, 'claude-opus-5-5')?.maxOutputTokens,
    ).toBe(ASSISTANT_V3_MAX_OUTPUT_TOKENS.anthropic)
  })

  it('owner 的主模型 DeepSeek V4.1 Flash：官方端点请求体里 max_tokens 64000（官方上限 384K），代理上一个上限字段都没有', async () => {
    const official = await sentBody(AI_ADAPTER_TYPES.DEEPSEEK, 'deepseek-flash')
    expect(official).toHaveProperty('model', 'deepseek-flash')
    expect(official).toHaveProperty('max_tokens', cap)
    expect(official).not.toHaveProperty('max_completion_tokens')
    const proxied = await sentBody(
      AI_ADAPTER_TYPES.DEEPSEEK,
      'deepseek-flash',
      PROXY,
    )
    expect(proxied).toHaveProperty('model', 'deepseek-flash')
    expect(proxied).not.toHaveProperty('max_tokens')
    expect(proxied).not.toHaveProperty('max_completion_tokens')
  })

  it('Grok 发出去的请求里 ⛔ 没有 max_tokens，只有 max_completion_tokens', async () => {
    const body = await sentBody(AI_ADAPTER_TYPES.XAI, 'grok-4.7')
    expect(body).not.toHaveProperty('max_tokens')
    expect(body).toHaveProperty('max_completion_tokens', cap)
  })
})
