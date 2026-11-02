/**
 * Worker ↔ 应用的那座桥（o-worker 第 2 步，2026-11-01；docs/design/worker.md）：
 * 签名、取 key、回调各只剩一份。此前取 key 抄了 3 份、结果回调 3 份，修一处漏一处。
 *
 * ⚠ 签名口径与应用侧 `src/lib/signature-verifiers/internal-execution.ts` 一字不差
 *   （版本 · 时间戳 · nonce · 方法 · 路径 · body SHA-256），改一边必须改另一边。
 */

const EXECUTION_SIGNATURE_VERSION = 'v1'
const EXECUTION_SIGNATURE_HEADER = 'X-Execution-Signature'
const EXECUTION_SIGNATURE_VERSION_HEADER = 'X-Execution-Signature-Version'
const EXECUTION_TIMESTAMP_HEADER = 'X-Execution-Timestamp'
const EXECUTION_NONCE_HEADER = 'X-Execution-Nonce'
const EXECUTION_SIGNATURE_ALGORITHM = 'HMAC'
const EXECUTION_SIGNATURE_HASH = 'SHA-256'
const EXECUTION_MAX_CLOCK_SKEW_MS = 5 * 60 * 1000
const JSON_CONTENT_TYPE = 'application/json'

/** 桥只需要这一把密钥；不 import Worker 的整个 env 类型，免得和 index.ts 互相引用。 */
interface BridgeEnv {
  INTERNAL_CALLBACK_SECRET?: string
}

/** 一次运行在桥上要用到的字段（图 / 视频 / 音频 / 3D 的上下文都有）。 */
interface BridgeRunContext {
  runId: string
  callbackUrl: string
  resolveKeyUrl: string
  apiKeyId?: string | null
  providerId: string
  useSystemKey?: boolean
}

export async function readText(request: Request): Promise<string | null> {
  try {
    return await request.text()
  } catch {
    return null
  }
}

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

export function timingSafeEqualHex(left: string, right: string): boolean {
  const leftBytes = hexToBytes(left)
  const rightBytes = hexToBytes(right)

  if (!leftBytes || !rightBytes || leftBytes.length !== rightBytes.length) {
    return false
  }

  let diff = 0
  for (let index = 0; index < leftBytes.length; index += 1) {
    diff |= leftBytes[index] ^ rightBytes[index]
  }
  return diff === 0
}

export async function signBody(secret: string, body: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: EXECUTION_SIGNATURE_ALGORITHM, hash: EXECUTION_SIGNATURE_HASH },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign(
    EXECUTION_SIGNATURE_ALGORITHM,
    key,
    encoder.encode(body),
  )

  return toHex(signature)
}

async function hashBody(body: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(body),
  )
  return toHex(digest)
}

async function buildCanonicalSignedRequest(input: {
  body: string
  method: string
  pathname: string
  timestamp: string
  nonce: string
}): Promise<string> {
  return [
    EXECUTION_SIGNATURE_VERSION,
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
  const canonical = await buildCanonicalSignedRequest({
    body: input.body,
    method,
    pathname: new URL(input.url).pathname,
    timestamp,
    nonce,
  })

  return {
    [EXECUTION_SIGNATURE_VERSION_HEADER]: EXECUTION_SIGNATURE_VERSION,
    [EXECUTION_TIMESTAMP_HEADER]: timestamp,
    [EXECUTION_NONCE_HEADER]: nonce,
    [EXECUTION_SIGNATURE_HEADER]: await signBody(input.secret, canonical),
  }
}

export async function verifySignedBody(
  request: Request,
  secret: string,
): Promise<string | null> {
  const rawBody = await readText(request)
  const signature = request.headers.get(EXECUTION_SIGNATURE_HEADER)
  const version = request.headers.get(EXECUTION_SIGNATURE_VERSION_HEADER)
  const timestamp = request.headers.get(EXECUTION_TIMESTAMP_HEADER)
  const nonce = request.headers.get(EXECUTION_NONCE_HEADER)

  if (
    !rawBody ||
    !signature ||
    version !== EXECUTION_SIGNATURE_VERSION ||
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
    Math.abs(Date.now() - timestampMs) > EXECUTION_MAX_CLOCK_SKEW_MS
  ) {
    return null
  }

  const canonical = await buildCanonicalSignedRequest({
    body: rawBody,
    method: request.method,
    pathname: new URL(request.url).pathname,
    timestamp,
    nonce,
  })
  const expectedSignature = await signBody(secret, canonical)
  return timingSafeEqualHex(signature, expectedSignature) ? rawBody : null
}

export async function postSignedJson(
  url: string,
  secret: string,
  payload: unknown,
): Promise<Response> {
  const body = JSON.stringify(payload)
  const signatureHeaders = await createSignedRequestHeaders({
    secret,
    body,
    url,
  })

  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': JSON_CONTENT_TYPE,
      ...signatureHeaders,
    },
    body,
  })
}

function requireSecret(env: BridgeEnv): string {
  if (!env.INTERNAL_CALLBACK_SECRET) {
    throw new Error('Internal callback secret is not configured.')
  }
  return env.INTERNAL_CALLBACK_SECRET
}

/** 向应用要这次运行的供应商 key（应用侧按 runId 核对任务、归属与状态）。 */
export async function resolveRunApiKey(
  env: BridgeEnv,
  context: Pick<
    BridgeRunContext,
    'resolveKeyUrl' | 'runId' | 'apiKeyId' | 'providerId' | 'useSystemKey'
  >,
): Promise<string> {
  const response = await postSignedJson(
    context.resolveKeyUrl,
    requireSecret(env),
    {
      runId: context.runId,
      apiKeyId: context.apiKeyId,
      adapterType: context.providerId,
      useSystemKey: context.useSystemKey,
    },
  )

  if (!response.ok) {
    throw new Error(`Resolve key failed with status ${response.status}`)
  }

  const payload = (await response.json()) as {
    success?: boolean
    data?: { apiKey?: unknown }
  }

  if (payload.success !== true || typeof payload.data?.apiKey !== 'string') {
    throw new Error('Resolve key returned an invalid response.')
  }

  return payload.data.apiKey
}

/** Civitai 下载 token：用户的或平台的；拿不到回 null（有的 LoRA 不需要）。 */
export async function resolveRunCivitaiToken(
  env: BridgeEnv,
  context: Pick<BridgeRunContext, 'resolveKeyUrl' | 'runId'>,
): Promise<string | null> {
  const response = await postSignedJson(
    context.resolveKeyUrl,
    requireSecret(env),
    {
      runId: context.runId,
      keyKind: 'civitai',
    },
  )

  if (!response.ok) return null

  const payload = (await response.json()) as {
    success?: boolean
    data?: { apiKey?: unknown }
  }

  return payload.success === true && typeof payload.data?.apiKey === 'string'
    ? payload.data.apiKey
    : null
}

/** 结果回调（成功 / 失败都走它），应用侧写库。 */
export async function emitRunResultCallback(
  env: BridgeEnv,
  context: Pick<BridgeRunContext, 'callbackUrl' | 'runId'>,
  data: unknown,
): Promise<void> {
  const callbackResponse = await postSignedJson(
    context.callbackUrl,
    requireSecret(env),
    {
      runId: context.runId,
      kind: 'result',
      ts: new Date().toISOString(),
      data,
    },
  )

  if (!callbackResponse.ok) {
    throw new Error(`Callback failed with status ${callbackResponse.status}`)
  }
}
