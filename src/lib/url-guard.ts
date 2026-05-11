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
