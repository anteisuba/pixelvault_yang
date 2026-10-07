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
