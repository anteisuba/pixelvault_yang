/**
 * app ↔ worker 的 HMAC 签名（与 `workers/execution/src/index.ts` **同一套口径**）。
 *
 * ⚠ 这是**逐字复制**而不是共享模块：两个 worker 各自打包，谁都不能从对方的 src
 * 里 import。口径变了要两处一起改 —— 分家的表现是 Next 签出来的请求被这边拒收，
 * 而拒收在日志里长得跟「worker 没部署」一模一样。
 *
 * 规范串：`v1\n<timestamp>\n<nonce>\n<METHOD>\n<pathname>\n<sha256(body)>`
 */

export const SIGNATURE_VERSION = 'v1'
export const SIGNATURE_HEADER = 'X-Execution-Signature'
export const SIGNATURE_VERSION_HEADER = 'X-Execution-Signature-Version'
export const TIMESTAMP_HEADER = 'X-Execution-Timestamp'
export const NONCE_HEADER = 'X-Execution-Nonce'
const ALGORITHM = 'HMAC'
const HASH = 'SHA-256'
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000

export function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export function hexToBytes(value: string): Uint8Array | null {
  const normalized = value.trim().toLowerCase()
  if (normalized.length % 2 !== 0 || !/^[0-9a-f]+$/.test(normalized)) {
    return null
  }
  const bytes = new Uint8Array(normalized.length / 2)
  for (let index = 0; index < normalized.length; index += 2) {
    bytes[index / 2] = Number.parseInt(normalized.slice(index, index + 2), 16)
  }
  return bytes
}

/** ⚠ 定时安全比较：`===` 会把签名的正确前缀长度泄漏出去。 */
export function timingSafeEqualHex(left: string, right: string): boolean {
  const leftBytes = hexToBytes(left)
  const rightBytes = hexToBytes(right)
  if (!leftBytes || !rightBytes || leftBytes.length !== rightBytes.length) {
    return false
  }
  let diff = 0
  for (let index = 0; index < leftBytes.length; index += 1) {
    diff |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0)
  }
  return diff === 0
}

export async function signBody(secret: string, body: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: ALGORITHM, hash: HASH },
    false,
    ['sign'],
  )
  return toHex(await crypto.subtle.sign(ALGORITHM, key, encoder.encode(body)))
}

async function hashBody(body: string): Promise<string> {
  return toHex(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body)),
  )
}

async function canonical(input: {
  body: string
  method: string
  pathname: string
  timestamp: string
  nonce: string
}): Promise<string> {
  return [
    SIGNATURE_VERSION,
    input.timestamp,
    input.nonce,
    input.method.toUpperCase(),
    input.pathname,
    await hashBody(input.body),
  ].join('\n')
}

export async function createSignedRequestHeaders(input: {
  secret: string
  body: string
  url: string
  method?: string
  timestamp?: number
  nonce?: string
}): Promise<Record<string, string>> {
  const method = input.method ?? 'POST'
  const timestamp = String(input.timestamp ?? Date.now())
  const nonce = input.nonce ?? crypto.randomUUID()
  return {
    [SIGNATURE_VERSION_HEADER]: SIGNATURE_VERSION,
    [TIMESTAMP_HEADER]: timestamp,
    [NONCE_HEADER]: nonce,
    [SIGNATURE_HEADER]: await signBody(
      input.secret,
      await canonical({
        body: input.body,
        method,
        pathname: new URL(input.url).pathname,
        timestamp,
        nonce,
      }),
    ),
  }
}

/** 验签通过返回原始 body，失败返回 `null`（⛔ 不区分失败原因，别帮攻击者调试）。 */
export async function verifySignedBody(
  request: Request,
  secret: string,
): Promise<string | null> {
  const rawBody = await request.text()
  const signature = request.headers.get(SIGNATURE_HEADER)
  const version = request.headers.get(SIGNATURE_VERSION_HEADER)
  const timestamp = request.headers.get(TIMESTAMP_HEADER)
  const nonce = request.headers.get(NONCE_HEADER)

  if (
    !rawBody ||
    !signature ||
    version !== SIGNATURE_VERSION ||
    !timestamp ||
    !/^\d{13}$/.test(timestamp) ||
    !nonce ||
    !/^[a-zA-Z0-9_-]{16,128}$/.test(nonce)
  ) {
    return null
  }

  const timestampMs = Number(timestamp)
  if (
    !Number.isSafeInteger(timestampMs) ||
    Math.abs(Date.now() - timestampMs) > MAX_CLOCK_SKEW_MS
  ) {
    return null
  }

  const expected = await signBody(
    secret,
    await canonical({
      body: rawBody,
      method: request.method,
      pathname: new URL(request.url).pathname,
      timestamp,
      nonce,
    }),
  )
  return timingSafeEqualHex(signature, expected) ? rawBody : null
}
