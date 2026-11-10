import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateText } from 'ai'

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
