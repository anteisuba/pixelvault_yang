import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'

import { createApiInternalRoute } from '@/lib/api-route-factory'
import { ApiRequestError } from '@/lib/errors'
import { ExecutionCallbackPayloadSchema } from '@/types'

export const runtime = 'nodejs'

const EXECUTION_SIGNATURE_HEADER = 'X-Execution-Signature'
const EXECUTION_SIGNATURE_ALGORITHM = 'sha256'
const EXECUTION_SIGNATURE_HEX_LENGTH = 64

interface ExecutionCallbackResponseData {
  receivedAt: string
}

function getInternalCallbackSecret(): string {
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

function parseSignatureHeader(signature: string | null): Buffer | null {
  if (!signature) return null

  const normalized = signature.trim().toLowerCase()

  if (
    normalized.length !== EXECUTION_SIGNATURE_HEX_LENGTH ||
    !/^[0-9a-f]+$/.test(normalized)
  ) {
    return null
  }

  return Buffer.from(normalized, 'hex')
}

function verifyExecutionSignature(rawBody: string, request: Request) {
  const signature = request.headers.get(EXECUTION_SIGNATURE_HEADER)
  const receivedSignature = parseSignatureHeader(signature)

  if (!receivedSignature) {
    throw new ApiRequestError(
      'INVALID_EXECUTION_SIGNATURE',
      401,
      'errors.auth.unauthorized',
      'Invalid execution signature.',
    )
  }

  const expectedSignature = createHmac(
    EXECUTION_SIGNATURE_ALGORITHM,
    getInternalCallbackSecret(),
  )
    .update(rawBody, 'utf8')
    .digest()

  if (
    receivedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(receivedSignature, expectedSignature)
  ) {
    throw new ApiRequestError(
      'INVALID_EXECUTION_SIGNATURE',
      401,
      'errors.auth.unauthorized',
      'Invalid execution signature.',
    )
  }
}

// ─── POST /api/internal/execution/callback ───────────────────────

export const POST = createApiInternalRoute<
  typeof ExecutionCallbackPayloadSchema,
  ExecutionCallbackResponseData
>({
  schema: ExecutionCallbackPayloadSchema,
  routeName: 'POST /api/internal/execution/callback',
  verifySignature: verifyExecutionSignature,
  handler: async ({ data }) => {
    const receivedAt = new Date().toISOString()

    console.log('[execution-callback] received payload', {
      payload: data,
      receivedAt,
    })

    return { receivedAt }
  },
})
