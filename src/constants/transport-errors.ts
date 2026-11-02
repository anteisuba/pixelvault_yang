/**
 * 请求**没到达业务代码**、或业务代码没给出 JSON 原因时的错误（o-errors 第二轮，
 * `docs/design/errors.md` §7）。
 *
 * 这些错误由前台 api-client 按**发生地的事实**打标（`fetch` 抛异常、HTTP 状态、响应体
 * 不是 JSON），⛔ 不从报错句子里猜。它们一律带 `i18nKey`，所以显示层（`useErrorText`）
 * 优先用这句，不会再落进 `ERROR_PATTERNS` 的关键词分类、被说成「API Key 无效」
 * 「模型不可用」或「服务商返回：Failed with status 404」（2026-10-29 / 11-02 真机）。
 */
export const TRANSPORT_ERROR_CODES = {
  /** 浏览器连不上（断网 / DNS / CORS）：`fetch` 直接抛 TypeError。 */
  NETWORK: 'TRANSPORT_NETWORK',
  /** 前台自己设的等待上限到了（`AbortSignal.timeout`）或网关 504 / 408。 */
  TIMEOUT: 'TRANSPORT_TIMEOUT',
  /** 自家 `/api` 回 401 且 `apiFetch` 续会话也续不上：真的登出 / 过期了。 */
  SESSION_EXPIRED: 'TRANSPORT_SESSION_EXPIRED',
  /** 403 且没有 JSON 原因。 */
  FORBIDDEN: 'TRANSPORT_FORBIDDEN',
  /** 404 / 405 且没有 JSON 原因：路由不存在（多半是刚部署、页面还是旧的）。 */
  NOT_FOUND: 'TRANSPORT_NOT_FOUND',
  /** 413：请求体超过平台上限（Vercel 函数 4.5 MB）。 */
  TOO_LARGE: 'TRANSPORT_TOO_LARGE',
  /** 429 且没有 JSON 原因。 */
  RATE_LIMITED: 'TRANSPORT_RATE_LIMITED',
  /** 5xx 且没有 JSON 原因：网关 / 函数崩了。 */
  UNAVAILABLE: 'TRANSPORT_UNAVAILABLE',
  /** 2xx 但响应体读不出来。 */
  BAD_RESPONSE: 'TRANSPORT_BAD_RESPONSE',
} as const

export type TransportErrorCode =
  (typeof TRANSPORT_ERROR_CODES)[keyof typeof TRANSPORT_ERROR_CODES]

export const TRANSPORT_ERROR_I18N_KEYS: Record<TransportErrorCode, string> = {
  [TRANSPORT_ERROR_CODES.NETWORK]: 'errors.transport.network',
  [TRANSPORT_ERROR_CODES.TIMEOUT]: 'errors.transport.timeout',
  [TRANSPORT_ERROR_CODES.SESSION_EXPIRED]: 'errors.transport.sessionExpired',
  [TRANSPORT_ERROR_CODES.FORBIDDEN]: 'errors.transport.forbidden',
  [TRANSPORT_ERROR_CODES.NOT_FOUND]: 'errors.transport.notFound',
  [TRANSPORT_ERROR_CODES.TOO_LARGE]: 'errors.transport.tooLarge',
  [TRANSPORT_ERROR_CODES.RATE_LIMITED]: 'errors.transport.rateLimited',
  [TRANSPORT_ERROR_CODES.UNAVAILABLE]: 'errors.transport.unavailable',
  [TRANSPORT_ERROR_CODES.BAD_RESPONSE]: 'errors.transport.badResponse',
}

/** 没有 JSON 原因时，HTTP 状态 → 哪一类。 */
export function transportCodeForStatus(status: number): TransportErrorCode {
  if (status === 401) return TRANSPORT_ERROR_CODES.SESSION_EXPIRED
  if (status === 403) return TRANSPORT_ERROR_CODES.FORBIDDEN
  if (status === 404 || status === 405) return TRANSPORT_ERROR_CODES.NOT_FOUND
  if (status === 408 || status === 504) return TRANSPORT_ERROR_CODES.TIMEOUT
  if (status === 413) return TRANSPORT_ERROR_CODES.TOO_LARGE
  if (status === 429) return TRANSPORT_ERROR_CODES.RATE_LIMITED
  if (status >= 500) return TRANSPORT_ERROR_CODES.UNAVAILABLE
  return TRANSPORT_ERROR_CODES.BAD_RESPONSE
}

/** 浏览器自己的网络失败（断网 / CORS / DNS）在各家浏览器里的原话。 */
export const BROWSER_NETWORK_FAILURE_RE =
  /^(?:Failed to fetch|NetworkError when attempting to fetch resource\.?|Load failed|Network request failed|fetch failed)$/i
