import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'

import { z } from 'zod'

import { createApiGetRoute } from '@/lib/api-route-factory'
import { ApiRequestError, GenerationValidationError } from '@/lib/errors'
import { ExecutionCallbackPayloadSchema } from '@/types'

export const runtime = 'nodejs'

const EMPTY_QUERY_SCHEMA = z.object({})
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

function assertValidExecutionSignature(body: string, signature: string | null) {
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
    .update(body, 'utf8')
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

function parseJsonBody(body: string): unknown {
  try {
    return JSON.parse(body)
  } catch {
    throw new ApiRequestError(
      'INVALID_JSON',
      400,
      'errors.validation.invalidJson',
      'Invalid JSON body.',
    )
  }
}

// ─── POST /api/internal/execution/callback ───────────────────────

export const POST = createApiGetRoute<
  typeof EMPTY_QUERY_SCHEMA,
  ExecutionCallbackResponseData
>({
  schema: EMPTY_QUERY_SCHEMA,
  routeName: 'POST /api/internal/execution/callback',
  requireAuth: false,
  handler: async ({ request }) => {
    const body = await request.text()
    assertValidExecutionSignature(
      body,
      request.headers.get(EXECUTION_SIGNATURE_HEADER),
    )

    const payload = parseJsonBody(body)
    const parsedPayload = ExecutionCallbackPayloadSchema.safeParse(payload)

    if (!parsedPayload.success) {
      throw new GenerationValidationError(
        parsedPayload.error.issues.map((issue) => ({
          field: String(issue.path?.join('.') ?? ''),
          message: issue.message,
        })),
      )
    }

    const receivedAt = new Date().toISOString()

    console.log('[execution-callback] received payload', {
      payload: parsedPayload.data,
      receivedAt,
    })

    return { receivedAt }
  },
})
