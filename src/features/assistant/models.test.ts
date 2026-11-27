import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateText } from 'ai'

import { ANTHROPIC_API } from '@/constants/config'
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

/** 记下发出去的请求，回一个 400（不必伪造各家的成功响应形状）。 */
function captureRequests() {
  const sent: {
    url: string
    body: Record<string, unknown>
    headers: Headers
  }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      sent.push({
        url: String(url),
        body: JSON.parse(String(init.body)) as Record<string, unknown>,
        headers: new Headers(init.headers),
      })
      return Response.json(
        { error: { message: 'captured', type: 'invalid_request_error' } },
        { status: 400 },
      )
    }),
  )
  return sent
}

async function send(
  model: NonNullable<ReturnType<typeof resolveNextModel>>,
  effort: 'low' | 'medium' | 'high' = 'high',
) {
  await generateText({
    model: model.model,
    prompt: 'hi',
    maxRetries: 0,
    tools: model.nativeTools,
    ...(model.headers ? { headers: model.headers('conv-1') } : {}),
    providerOptions: model.providerOptions('conv-1', effort),
  }).catch(() => undefined)
}

function routeOf(
  adapterType: AI_ADAPTER_TYPES,
  baseUrl: string,
): ResolvedLlmTextRoute {
  return {
    adapterType,
    providerConfig: { label: 'x', baseUrl },
    apiKey: 'test-key',
  } as unknown as ResolvedLlmTextRoute
}

describe('resolveNextModel · 照各家官方文档的请求参数（11-18）', () => {
  it('DeepSeek：主循环不挂联网（deepseek_web_search 不能与其它工具同开），思考档走 output_config.effort 且三档各不相同', async () => {
    const model = resolveNextModel(
      routeOf(AI_ADAPTER_TYPES.DEEPSEEK, 'https://api.deepseek.com'),
      'deepseek-flash',
    )!
    expect(model.path).toBe('deepseek-anthropic')
    expect(model.nativeTools).toEqual({})
    expect(model.fallback?.nativeTools).toEqual({})

    const sent = captureRequests()
    for (const effort of ['low', 'medium', 'high'] as const)
      await send(model, effort)
    expect(sent[0]?.url).toBe('https://api.deepseek.com/anthropic/v1/messages')
    expect(sent.map((request) => request.body.output_config)).toEqual([
      { effort: 'low' },
      { effort: 'high' },
      { effort: 'max' },
    ])
    expect(sent[0]?.body).not.toHaveProperty('tools')
  })

  it('没挂联网的接法在系统提示末尾说清楚，稳定段前缀不变', () => {
    const deepSeek = resolveNextModel(
      routeOf(AI_ADAPTER_TYPES.DEEPSEEK, 'https://api.deepseek.com'),
      'deepseek-flash',
    )!
    const text = deepSeek.system({ stable: 'STABLE', creator: 'CREATOR' })
    expect(typeof text === 'string' && text.startsWith('STABLECREATOR')).toBe(
      true,
    )
    expect(String(text)).toContain('no built-in web search')
    const gemini = resolveNextModel(
      routeOf(AI_ADAPTER_TYPES.GEMINI, ''),
      'gemini-3.8-flash',
    )!
    expect(gemini.system({ stable: 'S', creator: 'C' })).toBe('SC')
    expect(gemini.fallback?.system({ stable: 'S', creator: 'C' })).toContain(
      'no built-in web search',
    )
  })

  it('OpenAI 代理：先走 Responses 并带思考档，被拒退 Chat Completions 也带档；必须 Responses 才能调工具的型号带可读报错键', async () => {
    const model = resolveNextModel(
      routeOf(AI_ADAPTER_TYPES.OPENAI, 'https://proxy.example.test/v1'),
      'gpt-6.2-sol',
    )!
    expect(model.path).toBe('openai-proxy-responses')
    expect(model.fallback?.path).toBe('openai-chat')
    expect(model.fallback?.rejectedI18nKey).toBe(
      'errors.provider.proxyNeedsResponsesApi',
    )

    const sent = captureRequests()
    await send(model, 'low')
    await send(model.fallback!, 'medium')
    expect(sent[0]?.url).toBe('https://proxy.example.test/v1/responses')
    expect(sent[0]?.body.reasoning).toEqual({ effort: 'low' })
    expect(sent[1]?.url).toBe('https://proxy.example.test/v1/chat/completions')
    expect(sent[1]?.body.reasoning_effort).toBe('medium')

    const astra = resolveNextModel(
      routeOf(AI_ADAPTER_TYPES.OPENAI, 'https://proxy.example.test/v1'),
      'gpt-6.2-astra',
    )!
    expect(astra.fallback?.rejectedI18nKey).toBe(
      'errors.provider.proxyNeedsResponsesApi',
    )

    const custom = resolveNextModel(
      routeOf(AI_ADAPTER_TYPES.OPENAI, 'https://proxy.example.test/v1'),
      'custom-chat-model',
    )!
    expect(custom.fallback?.rejectedI18nKey).toBeUndefined()
  })

  it('OpenAI 官方：思考摘要 auto；被拒依次退到不带摘要、再到不带联网', async () => {
    const model = resolveNextModel(
      routeOf(AI_ADAPTER_TYPES.OPENAI, ''),
      'gpt-6.2-sol',
    )!
    expect(model.path).toBe('openai-responses+search+summary')
    expect(model.fallback?.path).toBe('openai-responses+search')
    expect(model.fallback?.fallback?.path).toBe('openai-responses')
    expect(model.fallback?.fallback?.fallback).toBeNull()

    const sent = captureRequests()
    await send(model, 'medium')
    await send(model.fallback!, 'medium')
    expect(sent[0]?.body.reasoning).toEqual({
      effort: 'medium',
      summary: 'auto',
    })
    expect(sent[0]?.body.prompt_cache_key).toBe('conv-1')
    expect(sent[1]?.body.reasoning).toEqual({ effort: 'medium' })
  })

  it('Grok：Responses 带 prompt_cache_key 与思考档（SDK 认不出 grok 是推理模型）；Chat 带 x-grok-conv-id 头', async () => {
    const model = resolveNextModel(
      routeOf(AI_ADAPTER_TYPES.XAI, ''),
      'grok-4.7',
    )!
    const sent = captureRequests()
    await send(model, 'low')
    await send(model.fallback!, 'medium')
    expect(sent[0]?.url).toBe('https://api.x.ai/v1/responses')
    expect(sent[0]?.body.prompt_cache_key).toBe('conv-1')
    expect(sent[0]?.body.reasoning).toEqual({ effort: 'low' })
    expect(sent[1]?.url).toBe('https://api.x.ai/v1/chat/completions')
    expect(sent[1]?.headers.get('x-grok-conv-id')).toBe('conv-1')
    expect(sent[1]?.body.reasoning_effort).toBe('medium')
  })

  it('Grok：WebP 转成 PNG 再交出去，JPEG / PNG 原样', async () => {
    const model = resolveNextModel(
      routeOf(AI_ADAPTER_TYPES.XAI, ''),
      'grok-4.7',
    )!
    const { encodeWebp } = await webpFixture()
    const converted = await model.preparePicture!({
      data: encodeWebp,
      mediaType: 'image/webp',
    })
    expect(converted.mediaType).toBe('image/png')
    expect(Array.from(converted.data.subarray(0, 4))).toEqual([
      0x89, 0x50, 0x4e, 0x47,
    ])
    const png = { data: converted.data, mediaType: 'image/png' }
    expect(await model.preparePicture!(png)).toBe(png)
    expect(model.fallback?.preparePicture).toBeDefined()
  })

  it('Claude：主循环带服务端拒答兜底（Haiku 5.5 没有，不带）；联网版本与单独联网调用同一个', async () => {
    const sent = captureRequests()
    const sonnet = resolveNextModel(route, 'claude-sonnet-5-5')!
    const haiku = resolveNextModel(route, 'claude-haiku-5-5')!
    await send(sonnet)
    await send(sonnet.fallback!)
    await send(haiku)
    expect(sent[0]?.body.fallbacks).toBe('default')
    expect(sent[0]?.headers.get('anthropic-beta')).toContain(
      ANTHROPIC_API.SERVER_SIDE_FALLBACK_BETA,
    )
    expect(sent[1]?.body.fallbacks).toBe('default')
    expect(sent[2]?.body).not.toHaveProperty('fallbacks')
    const tools = sent[0]?.body.tools as { type: string; name: string }[]
    expect(tools.find((tool) => tool.name === 'web_search')?.type).toBe(
      ANTHROPIC_API.WEB_SEARCH_TOOL_TYPE,
    )
  })
})

/** 一张 2×2 的 WebP（photon 编出来的真文件头）。 */
async function webpFixture() {
  const lib = await import('@cf-wasm/photon')
  const image = new lib.PhotonImage(new Uint8Array(16).fill(200), 2, 2)
  try {
    return { encodeWebp: new Uint8Array(image.get_bytes_webp()) }
  } finally {
    image.free()
  }
}
