import 'server-only'

import { promises as dns } from 'node:dns'
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

/**
 * 一个具体地址（IP 字面量，或域名的某条解析结果）是否落在禁区。
 * IP 字面量校验与 DNS 解析后校验共用这一份判据——两套判据必然漂移。
 */
function assertSafeAddress(address: string, source?: string): void {
  const from = source && source !== address ? ` (resolved from ${source})` : ''
  const ipKind = isIP(address)
  if (ipKind === 4 && isPrivateIPv4(address)) {
    throw new Error(`Blocked private IPv4: ${address}${from}`)
  }
  if (ipKind === 6 && isPrivateIPv6(address)) {
    throw new Error(`Blocked private IPv6: ${address}${from}`)
  }
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
  assertSafeAddress(bareHost)
  return parsed
}

/**
 * DNS 解析后的 IP 校验。`assertSafeUrl` 只能看 URL 里写的东西——hostname 是域名
 * 时它无从判断，放行后由 `fetch` 自己解析，于是 `evil.example.com A 127.0.0.1`
 * （DNS rebinding）能整条穿过防护。这里把 hostname 的**全部**解析结果都过一遍
 * 同一份判据，任一条命中禁区即整体拒绝。
 *
 * ⚠ **残余风险：TOCTOU。** 校验用的是这次 `lookup` 的结果，真正发请求的是
 * `fetch` 自己的第二次解析——中间那一瞬 DNS 换答案仍可绕过。彻底堵住需要把
 * 已校验的地址钉进连接层（undici `Agent({ connect: { lookup } })` 作为
 * `dispatcher`），但本仓没有 undici 依赖（Node 内置的那份不可 import），而
 * Engineering Principle「加包之前先翻已有依赖」下不值得为此新增一个包。
 * 用 TTL≈0 的攻击者域名做 rebinding 的窗口仍然存在，只是从「必中」降到
 * 「要卡在两次解析之间」。
 */
async function assertSafeResolvedHost(hostname: string): Promise<void> {
  const bareHost = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  // IP 字面量在 assertSafeUrl 里已经判过，没有解析这一步。
  if (isIP(bareHost)) return

  let records: Array<{ address: string }>
  try {
    records = await dns.lookup(bareHost, { all: true })
  } catch {
    throw new Error(`DNS resolution failed: ${bareHost}`)
  }
  if (records.length === 0) {
    throw new Error(`DNS resolution failed: ${bareHost}`)
  }
  for (const record of records) {
    assertSafeAddress(record.address, bareHost)
  }
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
  await assertSafeResolvedHost(initialUrl.hostname)
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
    await assertSafeResolvedHost(nextUrl.hostname)
    // 判据用「首跳的源」而不是「上一跳的源」：一旦摘掉就不再恢复，两种写法
    // 结果等价，而这种写法不需要额外的状态位。
    if (nextUrl.origin !== initialUrl.origin) {
      currentHeaders = stripCredentialHeadersForCrossOrigin(currentHeaders)
    }
    currentUrl = nextUrl.toString()
  }

  throw new Error('Too many redirects')
}
