import { afterEach, describe, expect, it, vi } from 'vitest'
import { Agent } from 'undici'

vi.mock('server-only', () => ({}))

import { aiGatewayFetch, routeThroughAiGateway } from '@/lib/ai-gateway'

const GATEWAY = 'https://gateway.ai.cloudflare.com/v1/acc/gw'

describe('routeThroughAiGateway', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('leaves requests untouched while no gateway is configured', () => {
    vi.stubEnv('CLOUDFLARE_AI_GATEWAY_URL', '')
    const routed = routeThroughAiGateway(
      'https://api.openai.com/v1/chat/completions',
      { Authorization: 'Bearer user-key' },
    )
    expect(routed.endpoint).toBe('https://api.openai.com/v1/chat/completions')
  })

  it.each([
    [
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:streamGenerateContent?alt=sse',
      `${GATEWAY}/google-ai-studio/v1beta/models/gemini-3.8-flash:streamGenerateContent?alt=sse`,
    ],
    [
      'https://api.openai.com/v1/chat/completions',
      `${GATEWAY}/openai/chat/completions`,
    ],
    [
      'https://api.anthropic.com/v1/messages',
      `${GATEWAY}/anthropic/v1/messages`,
    ],
    [
      'https://api.deepseek.com/chat/completions',
      `${GATEWAY}/deepseek/chat/completions`,
    ],
    [
      'https://api.x.ai/v1/chat/completions',
      `${GATEWAY}/grok/v1/chat/completions`,
    ],
  ])('routes %s through the gateway, keeping the user key', (from, to) => {
    vi.stubEnv('CLOUDFLARE_AI_GATEWAY_URL', `${GATEWAY}/`)
    vi.stubEnv('CLOUDFLARE_AI_GATEWAY_TOKEN', 'cf-token')
    const routed = routeThroughAiGateway(from, { 'x-api-key': 'user-key' })
    expect(routed.endpoint).toBe(to)
    const headers = new Headers(routed.headers)
    expect(headers.get('x-api-key')).toBe('user-key')
    expect(headers.get('cf-aig-authorization')).toBe('Bearer cf-token')
  })

  it('keeps a custom base URL direct', () => {
    vi.stubEnv('CLOUDFLARE_AI_GATEWAY_URL', GATEWAY)
    expect(
      routeThroughAiGateway(
        'https://my-proxy.example.com/v1/chat/completions',
        {},
      ).endpoint,
    ).toBe('https://my-proxy.example.com/v1/chat/completions')
    expect(
      routeThroughAiGateway('https://api.openai.com.evil.test/v1/x', {})
        .endpoint,
    ).toBe('https://api.openai.com.evil.test/v1/x')
  })
})

describe('aiGatewayFetch（给 AI SDK 的 fetch）', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('官方地址改道网关并带上网关令牌；没配网关原样直连', async () => {
    const seen: Array<{ url: string; auth: string | null }> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        seen.push({
          url,
          auth: new Headers(init?.headers).get('cf-aig-authorization'),
        })
        return new Response('{}')
      }),
    )
    vi.stubEnv('CLOUDFLARE_AI_GATEWAY_URL', GATEWAY)
    vi.stubEnv('CLOUDFLARE_AI_GATEWAY_TOKEN', 'gw-token')
    await aiGatewayFetch('https://api.deepseek.com/anthropic/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': 'user-key' },
    })
    vi.stubEnv('CLOUDFLARE_AI_GATEWAY_URL', '')
    await aiGatewayFetch('https://api.deepseek.com/chat/completions')

    expect(seen).toEqual([
      {
        url: `${GATEWAY}/deepseek/anthropic/v1/messages`,
        auth: 'Bearer gw-token',
      },
      { url: 'https://api.deepseek.com/chat/completions', auth: null },
    ])
  })

  // 11-05：Node fetch 默认流上 300 秒没字节就断（undici bodyTimeout）—— 想得久的模型会被误杀。
  // 每条助手模型请求都必须带上关掉静默计时的 dispatcher（真断线行为 11-05 用本地脚本实测过）。
  it('每条请求都带关掉静默断线的 dispatcher（改道与直连都带）', async () => {
    const dispatchers: unknown[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (_url: string, init?: RequestInit & { dispatcher?: unknown }) => {
          dispatchers.push(init?.dispatcher)
          return new Response('{}')
        },
      ),
    )
    vi.stubEnv('CLOUDFLARE_AI_GATEWAY_URL', GATEWAY)
    await aiGatewayFetch('https://api.deepseek.com/anthropic/v1/messages')
    vi.stubEnv('CLOUDFLARE_AI_GATEWAY_URL', '')
    await aiGatewayFetch('https://api.deepseek.com/chat/completions')
    await aiGatewayFetch(
      new Request('https://api.deepseek.com/chat/completions'),
    )

    expect(dispatchers).toHaveLength(3)
    for (const dispatcher of dispatchers)
      expect(dispatcher).toBeInstanceOf(Agent)
  })
})
