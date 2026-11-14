import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateText, tool } from 'ai'
import { z } from 'zod'

import { AI_PROVIDER_ENDPOINTS, LLM_TEXT_MODEL_IDS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { resolveNextModel } from '@/features/assistant/models'
import type { ResolvedLlmTextRoute } from '@/services/llm-text.service'

vi.mock('server-only', () => ({}))

const route = {
  adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
  providerConfig: { baseUrl: 'https://anthropic.example.test/v1' },
  apiKey: 'test-key',
} as unknown as ResolvedLlmTextRoute

afterEach(() => vi.unstubAllGlobals())

describe('resolveNextModel · Claude', () => {
  it('lets Claude drop thinking blocks whose prefix changed instead of failing the call', async () => {
    const requests: { body: Record<string, unknown>; beta: string }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        requests.push({
          body: JSON.parse(String(init.body)) as Record<string, unknown>,
          beta: new Headers(init.headers).get('anthropic-beta') ?? '',
        })
        return Response.json({
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          model: 'claude-sonnet-5-5',
          content: [{ type: 'text', text: 'ok' }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 1 },
        })
      }),
    )
    const model = resolveNextModel(route, 'claude-sonnet-5-5')!

    await generateText({
      model: model.model,
      prompt: 'hi',
      providerOptions: model.providerOptions('key', 'high'),
    })

    expect(requests[0]?.body.thinking).toMatchObject({
      type: 'adaptive',
      block_binding: { prefix_mismatch_behavior: 'drop_block' },
    })
    expect(requests[0]?.beta).toContain('thinking-binding-controls-2026-08-01')
  })
})

describe('resolveNextModel · Claude 缓存断点（11-10）', () => {
  async function sentBody(historyEnd?: number) {
    let body: Record<string, unknown> = {}
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        body = JSON.parse(String(init.body)) as Record<string, unknown>
        return Response.json({
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          model: 'claude-sonnet-5-5',
          content: [{ type: 'text', text: 'ok' }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 1 },
        })
      }),
    )
    const model = resolveNextModel(route, 'claude-sonnet-5-5')!
    const history = [
      { role: 'user' as const, content: '上一轮你说的' },
      { role: 'assistant' as const, content: '上一轮我答的' },
    ]
    const messages = [
      ...(historyEnd ? history : []),
      { role: 'user' as const, content: '这一轮的开场' },
    ]
    await generateText({
      model: model.model,
      system: model.system({ stable: 'STABLE', creator: 'CREATOR' }),
      messages: model.messages(messages, historyEnd),
    })
    return body as {
      system: { cache_control?: unknown }[]
      messages: { content: { cache_control?: unknown }[] }[]
    }
  }
  const marked = (parts: { cache_control?: unknown }[]) =>
    parts.some((part) => part.cache_control !== undefined)

  it('⭐ 系统两段、历史末尾、最后一条各一个，正好 4 个', async () => {
    const body = await sentBody(2)
    expect(body.system.map((part) => part.cache_control !== undefined)).toEqual(
      [true, true],
    )
    expect(body.messages.map((message) => marked(message.content))).toEqual([
      false,
      true,
      true,
    ])
    expect(JSON.stringify(body).match(/"cache_control"/g)).toHaveLength(4)
  })

  it('没有之前几轮：只在最后一条打', async () => {
    const body = await sentBody(0)
    expect(body.messages.map((message) => marked(message.content))).toEqual([
      true,
    ])
    expect(JSON.stringify(body).match(/"cache_control"/g)).toHaveLength(3)
  })
})

describe('resolveNextModel · DeepSeek 自带联网与读链接（11-14）', () => {
  const deepSeekRoute = (baseUrl: string) =>
    ({
      adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
      providerConfig: { baseUrl },
      apiKey: 'test-key',
    }) as unknown as ResolvedLlmTextRoute

  it('官方入口的 flash 走新工具，被拒退回旧联网；代理端点与别的型号照旧', () => {
    const official = resolveNextModel(
      deepSeekRoute(AI_PROVIDER_ENDPOINTS.DEEPSEEK),
      LLM_TEXT_MODEL_IDS.DEEPSEEK_FLASH,
    )!
    expect(official.path).toBe('deepseek-anthropic+native')
    expect(Object.keys(official.nativeTools ?? {})).toEqual([
      'web_search',
      'web_fetch',
    ])
    expect(official.fallback?.path).toBe('deepseek-anthropic+search')
    expect(
      resolveNextModel(
        deepSeekRoute('https://proxy.example.test/v1'),
        LLM_TEXT_MODEL_IDS.DEEPSEEK_FLASH,
      )!.path,
    ).toBe('deepseek-anthropic+search')
    expect(
      resolveNextModel(
        deepSeekRoute(AI_PROVIDER_ENDPOINTS.DEEPSEEK),
        'deepseek-v4-pro',
      )!.path,
    ).toBe('deepseek-anthropic+search')
  })

  it('⭐ 发出去的请求：两种自带工具是 DeepSeek 的声明，我们叫 find 的工具换了别名，没有 beta 头', async () => {
    const requests: { body: Record<string, unknown>; beta: string | null }[] =
      []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        requests.push({
          body: JSON.parse(String(init.body)) as Record<string, unknown>,
          beta: new Headers(init.headers).get('anthropic-beta'),
        })
        return Response.json({
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          model: 'deepseek-flash',
          content: [{ type: 'text', text: 'ok' }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 1 },
        })
      }),
    )
    const model = resolveNextModel(
      deepSeekRoute(AI_PROVIDER_ENDPOINTS.DEEPSEEK),
      LLM_TEXT_MODEL_IDS.DEEPSEEK_FLASH,
    )!

    await generateText({
      model: model.model,
      prompt: 'hi',
      tools: {
        ...model.nativeTools,
        find: tool({ inputSchema: z.object({ query: z.string() }) }),
      },
    })

    const tools = requests[0]?.body.tools as { type?: string; name: string }[]
    expect(tools.map((item) => item.name)).toEqual([
      'deepseek_web_search',
      'deepseek_read_url',
      'studio_find',
    ])
    expect(tools[0]).toEqual({
      type: 'deepseek_web_search',
      name: 'deepseek_web_search',
    })
    expect(requests[0]?.beta).toBeNull()
  })
})
