import { afterEach, describe, expect, it, vi } from 'vitest'

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
})
