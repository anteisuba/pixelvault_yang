import 'server-only'

import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto'

import { EXECUTION_INTERNAL } from '@/constants/execution'
import { ApiRequestError } from '@/lib/errors'
import { consumeExecutionNonce } from '@/lib/execution-replay-guard'

function getSecret(): string {
  const secret = process.env.INTERNAL_CALLBACK_SECRET

  if (!secret) {
    throw new ApiRequestError(
      'INTERNAL_CALLBACK_SECRET_MISSING',
      500,
      'errors.common.unexpected',
      'Internal callback secret is not configured.',
    )
  }

  return secret
}

function parseHex(signature: string | null): Buffer | null {
  if (!signature) return null

  const normalized = signature.trim().toLowerCase()

  if (
    normalized.length !== EXECUTION_INTERNAL.SIGNATURE_HEX_LENGTH ||
    !/^[0-9a-f]+$/.test(normalized)
  ) {
    return null
  }

  return Buffer.from(normalized, 'hex')
}

function invalidSignature(errorCode = 'INVALID_EXECUTION_SIGNATURE'): never {
  throw new ApiRequestError(
    errorCode,
    401,
    'errors.auth.unauthorized',
    'Invalid execution signature.',
  )
}

function hashBody(body: string): string {
  return createHash('sha256').update(body, 'utf8').digest('hex')
}

function canonicalRequest(input: {
  body: string
  method: string
  pathname: string
  timestamp: string
  nonce: string
}): string {
  return [
    EXECUTION_INTERNAL.SIGNATURE_VERSION,
    input.timestamp,
    input.nonce,
    input.method.toUpperCase(),
    input.pathname,
    hashBody(input.body),
  ].join('\n')
}

function signCanonicalPayload(payload: string, secret: string): string {
  return createHmac(EXECUTION_INTERNAL.SIGNATURE_ALGORITHM, secret)
    .update(payload, 'utf8')
    .digest('hex')
}

export interface InternalExecutionHeadersInput {
  body: string
  method: string
  url: string
  secret: string
  timestamp?: number
  nonce?: string
}

/** Create all headers required by the versioned internal request protocol. */
export function createInternalExecutionHeaders(
  input: InternalExecutionHeadersInput,
): Record<string, string> {
  const timestamp = String(input.timestamp ?? Date.now())
  const nonce = input.nonce ?? randomUUID()
  const pathname = new URL(input.url).pathname
  const signature = signCanonicalPayload(
    canonicalRequest({
      body: input.body,
      method: input.method,
      pathname,
      timestamp,
      nonce,
    }),
    input.secret,
  )

  return {
    [EXECUTION_INTERNAL.VERSION_HEADER]: EXECUTION_INTERNAL.SIGNATURE_VERSION,
    [EXECUTION_INTERNAL.TIMESTAMP_HEADER]: timestamp,
    [EXECUTION_INTERNAL.NONCE_HEADER]: nonce,
    [EXECUTION_INTERNAL.SIGNATURE_HEADER]: signature,
  }
}

/**
 * Verify that the incoming request carries a valid HMAC-SHA256 signature.
 * Throws ApiRequestError on any failure.
 */
export async function verifyInternalExecutionSignature(
  rawBody: string,
  request: Request,
): Promise<void> {
  const version = request.headers.get(EXECUTION_INTERNAL.VERSION_HEADER)
  const timestamp = request.headers.get(EXECUTION_INTERNAL.TIMESTAMP_HEADER)
  const nonce = request.headers.get(EXECUTION_INTERNAL.NONCE_HEADER)
  const receivedSig = parseHex(
    request.headers.get(EXECUTION_INTERNAL.SIGNATURE_HEADER),
  )

  if (
    version !== EXECUTION_INTERNAL.SIGNATURE_VERSION ||
    !timestamp ||
    !/^\d{13}$/.test(timestamp) ||
    !nonce ||
    !/^[a-zA-Z0-9_-]{16,128}$/.test(nonce) ||
    !receivedSig
  ) {
    invalidSignature()
  }

  const timestampMs = Number(timestamp)
  if (
    !Number.isSafeInteger(timestampMs) ||
    Math.abs(Date.now() - timestampMs) > EXECUTION_INTERNAL.MAX_CLOCK_SKEW_MS
  ) {
    invalidSignature('EXECUTION_SIGNATURE_EXPIRED')
  }

  const expectedSig = Buffer.from(
    signCanonicalPayload(
      canonicalRequest({
        body: rawBody,
        method: request.method,
        pathname: new URL(request.url).pathname,
        timestamp,
        nonce,
      }),
      getSecret(),
    ),
    'hex',
  )

  if (
    receivedSig.length !== expectedSig.length ||
    !timingSafeEqual(receivedSig, expectedSig)
  ) {
    invalidSignature()
  }

  let consumed: boolean
  try {
    consumed = await consumeExecutionNonce(
      nonce,
      EXECUTION_INTERNAL.NONCE_TTL_SECONDS,
    )
  } catch {
    throw new ApiRequestError(
      'EXECUTION_REPLAY_GUARD_UNAVAILABLE',
      503,
      'errors.common.unexpected',
      'Execution replay protection is unavailable.',
    )
  }

  if (!consumed) invalidSignature('EXECUTION_REPLAY_DETECTED')
}
