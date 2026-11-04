import 'server-only'

import { AI_GATEWAY_PROVIDER_ROUTES } from '@/constants/config'

/**
 * 把一条 LLM 请求改道 Cloudflare AI Gateway（`CLOUDFLARE_AI_GATEWAY_URL` 配了才生效）。
 *
 * ⚠ 只认官方默认地址（`AI_GATEWAY_PROVIDER_ROUTES`）：用户自配的 baseUrl 原样直连。
 * 网关开了鉴权时带上 `cf-aig-authorization`（`CLOUDFLARE_AI_GATEWAY_TOKEN`）。
 */
export function routeThroughAiGateway(
  endpoint: string,
  headers: HeadersInit | undefined,
): { endpoint: string; headers: HeadersInit | undefined } {
  const gateway = process.env.CLOUDFLARE_AI_GATEWAY_URL?.replace(/\/+$/, '')
  if (!gateway) return { endpoint, headers }
  const route = AI_GATEWAY_PROVIDER_ROUTES.find(
    ({ prefix }) =>
      endpoint === prefix ||
      endpoint.startsWith(`${prefix}/`) ||
      endpoint.startsWith(`${prefix}?`),
  )
  if (!route) return { endpoint, headers }
  const routed = new Headers(headers)
  const token = process.env.CLOUDFLARE_AI_GATEWAY_TOKEN
  if (token) routed.set('cf-aig-authorization', `Bearer ${token}`)
  return {
    endpoint: `${gateway}/${route.path}${endpoint.slice(route.prefix.length)}`,
    headers: routed,
  }
}

/**
 * 给 AI SDK 的 `fetch`：助手新内核直接用 AI SDK 发请求、不过 `llm-core` 那个 fetch，
 * 没有这个就绕开了网关（日志 / 限流 / 重试都没留下）。改道规则与 `routeThroughAiGateway` 同一套。
 */
export const aiGatewayFetch: typeof fetch = (input, init) => {
  if (input instanceof Request) return fetch(input, init)
  const routed = routeThroughAiGateway(String(input), init?.headers)
  return fetch(routed.endpoint, { ...init, headers: routed.headers })
}
