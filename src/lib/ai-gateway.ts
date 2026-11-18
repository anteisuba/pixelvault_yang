import 'server-only'

import { AsyncLocalStorage } from 'node:async_hooks'

import { Agent } from 'undici'

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
 * 助手模型请求用的连接池：**关掉 Node fetch 自带的两个静默计时器**（owner 11-05：思考过程不许被打断）。
 *
 * Node 的全局 fetch（undici）默认 `headersTimeout` / `bodyTimeout` 都是 300 秒：流上 300 秒
 * 一个字节都没有就断，报 `TypeError: terminated`（cause `UND_ERR_BODY_TIMEOUT`）。OpenAI /
 * Grok 的 Responses 不流思考（我们没开 reasoning summary），高档位想 5 分钟以上就会被它掐 ——
 * 和 11-05 删掉的 90 秒看门狗是同一类误杀，只是藏在运行时里。
 * 真卡死的连接交给整次请求的时间预算（`ASSISTANT_OPERATOR_TIME_BUDGET.hardMs`）收尾。
 * ⚠ 连接超时（`connect.timeout`，默认 10 秒）保留：连不上要尽快说「连不上」。
 * ⚠ `undici` 在 `next.config.ts` 的 `serverExternalPackages` 里：不打包、运行时从 node_modules 取。
 */
const NO_SILENCE_TIMEOUT_DISPATCHER = new Agent({
  headersTimeout: 0,
  bodyTimeout: 0,
})

/** Node 的 fetch 认 `dispatcher`（undici 扩展字段），标准 `RequestInit` 类型里没有。 */
type NodeRequestInit = RequestInit & { dispatcher: Agent }

/**
 * 一次模型调用里真正发出去几次 HTTP、各回了什么、最后那次多久回头（11-18「首页首句等两分钟」）。
 * AI SDK 自己的重发（`maxRetries`，429 / 5xx 会按 `retry-after` 等）在我们日志里看不见：
 * 没有这几格就分不清「厂商首字慢」和「被拒了在退避重发」。只有数。
 */
export interface AiFetchTrace {
  /** 每次请求一格：HTTP 状态码，连不上 / 被掐 = `'net'`。几格 = 发了几次。 */
  statuses: Array<number | 'net'>
  /** 从开始量到最后一次请求拿到响应头（含之前每次重发与退避）。 */
  headersMs: number | null
  readonly startedAt: number
}

const fetchTraceStore = new AsyncLocalStorage<AiFetchTrace>()

/** 在 `run` 里发出的 `aiGatewayFetch`（含 SDK 稍后的重发）都记进同一份 trace。 */
export function withAiFetchTrace<T>(run: () => T): {
  result: T
  trace: AiFetchTrace
} {
  const trace: AiFetchTrace = {
    statuses: [],
    headersMs: null,
    startedAt: Date.now(),
  }
  return { result: fetchTraceStore.run(trace, run), trace }
}

function traced(response: Promise<Response>): Promise<Response> {
  const trace = fetchTraceStore.getStore()
  if (!trace) return response
  return response.then(
    (value) => {
      trace.statuses.push(value.status)
      trace.headersMs = Date.now() - trace.startedAt
      return value
    },
    (error: unknown) => {
      trace.statuses.push('net')
      throw error
    },
  )
}

/**
 * 给 AI SDK 的 `fetch`：助手新内核直接用 AI SDK 发请求、不过 `llm-core` 那个 fetch，
 * 没有这个就绕开了网关（日志 / 限流 / 重试都没留下）。改道规则与 `routeThroughAiGateway` 同一套。
 */
export const aiGatewayFetch: typeof fetch = (input, init) => {
  if (input instanceof Request) {
    const passthrough: NodeRequestInit = {
      ...init,
      dispatcher: NO_SILENCE_TIMEOUT_DISPATCHER,
    }
    return traced(fetch(input, passthrough))
  }
  const routed = routeThroughAiGateway(String(input), init?.headers)
  const routedInit: NodeRequestInit = {
    ...init,
    headers: routed.headers,
    dispatcher: NO_SILENCE_TIMEOUT_DISPATCHER,
  }
  return traced(fetch(routed.endpoint, routedInit))
}
