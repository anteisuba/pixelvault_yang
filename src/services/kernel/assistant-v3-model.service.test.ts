import { generateText, type ModelMessage } from 'ai'
import { afterEach, describe, expect, it, vi } from 'vitest'

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
