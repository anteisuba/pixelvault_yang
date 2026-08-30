import 'server-only'

import { isIP } from 'node:net'

const PRIVATE_IPV4_PATTERNS: RegExp[] = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^192\.0\.0\./,
  /^198\.(1[89])\./,
]

function isPrivateIPv4(addr: string): boolean {
  return PRIVATE_IPV4_PATTERNS.some((rx) => rx.test(addr))
}

function isPrivateIPv6(addr: string): boolean {
  const lower = addr.toLowerCase()
  if (lower === '::1' || lower === '::') return true
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true
  if (
    lower.startsWith('fe80:') ||
    lower.startsWith('fe9') ||
    lower.startsWith('fea') ||
    lower.startsWith('feb')
  )
    return true
  if (lower.startsWith('::ffff:')) {
    const v4 = lower.slice(7)
    if (isIP(v4) === 4 && isPrivateIPv4(v4)) return true
  }
  return false
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata.google.internal',
])

export interface UrlGuardOptions {
  allowedProtocols?: ReadonlyArray<'http:' | 'https:'>
}

export interface SafeFetchOptions extends Omit<RequestInit, 'redirect'> {
  allowedProtocols?: ReadonlyArray<'http:' | 'https:'>
  maxRedirects?: number
}

export function assertSafeUrl(
  rawUrl: string,
  options: UrlGuardOptions = {},
): URL {
  const { allowedProtocols = ['https:'] } = options
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error('Invalid URL')
  }
  if (!allowedProtocols.includes(parsed.protocol as 'http:' | 'https:')) {
    throw new Error(`Disallowed protocol: ${parsed.protocol}`)
  }
  const hostname = parsed.hostname.toLowerCase()
  const bareHost = hostname.replace(/^\[|\]$/g, '')
  if (BLOCKED_HOSTNAMES.has(bareHost)) {
    throw new Error(`Blocked hostname: ${bareHost}`)
  }
  const ipKind = isIP(bareHost)
  if (ipKind === 4 && isPrivateIPv4(bareHost)) {
    throw new Error(`Blocked private IPv4: ${bareHost}`)
  }
  if (ipKind === 6 && isPrivateIPv6(bareHost)) {
    throw new Error(`Blocked private IPv6: ${bareHost}`)
  }
  return parsed
}

export function isSafeUrl(rawUrl: string, options?: UrlGuardOptions): boolean {
  try {
    assertSafeUrl(rawUrl, options)
    return true
  } catch {
    return false
  }
}

function isRedirectStatus(status: number): boolean {
  return status >= 300 && status < 400
}

function resolveRedirectUrl(location: string, currentUrl: string): string {
  return new URL(location, currentUrl).toString()
}

/**
 * 跨源重定向必须把凭据头摘掉（WHATWG fetch §"HTTP-redirect fetch" 第 12 步：
 * `Authorization` / `Cookie` / `Proxy-Authorization` 在跨源跳转时删除）。
 * 我们自己走手动重定向，不摘就等于把 header 原样转发给了第三方主机。
 *
 * 这不是理论洁癖，是真实故障（2026-08-29 实测）：Civitai 的
 * `/api/download/models/:id` 307 到一个 **AWS SigV4 预签名**的 R2 链接
 * （`X-Amz-SignedHeaders=host`）。第二跳只要带上 `Authorization`，R2 就改走
 * header 签名校验并返 **400 `InvalidRequest: Missing x-amz-content-sha256`**
 * ——不带这个头则 200。也就是说：配了 Civitai token 反而让所有 LoRA 缓存请求
 * 必然失败，而报错长得像"下载挂了"。顺带把 token 泄给了 CDN 主机。
 */
const CROSS_ORIGIN_STRIPPED_HEADERS = [
  'authorization',
  'cookie',
  'proxy-authorization',
]

function stripCredentialHeadersForCrossOrigin(
  headers: HeadersInit | undefined,
): HeadersInit | undefined {
  if (!headers) return headers
  const next = new Headers(headers)
  for (const name of CROSS_ORIGIN_STRIPPED_HEADERS) {
    next.delete(name)
  }
  return next
}

export async function safeFetch(
  rawUrl: string,
  options: SafeFetchOptions = {},
): Promise<Response> {
  const {
    allowedProtocols = ['https:'],
    maxRedirects = 3,
    ...fetchOptions
  } = options

  const initialUrl = assertSafeUrl(rawUrl, { allowedProtocols })
  let currentUrl = initialUrl.toString()
  let currentHeaders = fetchOptions.headers

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount++) {
    const response = await fetch(currentUrl, {
      ...fetchOptions,
      headers: currentHeaders,
      redirect: 'manual',
    })

    if (!isRedirectStatus(response.status)) {
      return response
    }

    const location = response.headers.get('location')
    if (!location) {
      return response
    }

    if (redirectCount === maxRedirects) {
      throw new Error('Too many redirects')
    }

    const nextUrl = assertSafeUrl(resolveRedirectUrl(location, currentUrl), {
      allowedProtocols,
    })
    // 判据用「首跳的源」而不是「上一跳的源」：一旦摘掉就不再恢复，两种写法
    // 结果等价，而这种写法不需要额外的状态位。
    if (nextUrl.origin !== initialUrl.origin) {
      currentHeaders = stripCredentialHeadersForCrossOrigin(currentHeaders)
    }
    currentUrl = nextUrl.toString()
  }

  throw new Error('Too many redirects')
}
