import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'

import { EXECUTION_INTERNAL } from '@/constants/execution'
import { ApiRequestError } from '@/lib/errors'

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

/** Sign a string payload with the internal callback secret. */
export function signPayload(body: string, secret: string): string {
  return createHmac(EXECUTION_INTERNAL.SIGNATURE_ALGORITHM, secret)
    .update(body, 'utf8')
    .digest('hex')
}

/**
 * Verify that the incoming request carries a valid HMAC-SHA256 signature.
 * Throws ApiRequestError on any failure.
 */
export function verifyInternalExecutionSignature(
  rawBody: string,
  request: Request,
): void {
  const receivedSig = parseHex(
    request.headers.get(EXECUTION_INTERNAL.SIGNATURE_HEADER),
  )

  if (!receivedSig) {
    throw new ApiRequestError(
      'INVALID_EXECUTION_SIGNATURE',
      401,
      'errors.auth.unauthorized',
      'Invalid execution signature.',
    )
  }

  const expectedSig = Buffer.from(signPayload(rawBody, getSecret()), 'hex')

  if (
    receivedSig.length !== expectedSig.length ||
    !timingSafeEqual(receivedSig, expectedSig)
  ) {
    throw new ApiRequestError(
      'INVALID_EXECUTION_SIGNATURE',
      401,
      'errors.auth.unauthorized',
      'Invalid execution signature.',
    )
  }
}
