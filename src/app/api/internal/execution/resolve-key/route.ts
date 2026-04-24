import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'

import type { NextRequest } from 'next/server'

import { EXECUTION_INTERNAL } from '@/constants/execution'
import { createApiInternalRoute } from '@/lib/api-route-factory'
import { ApiRequestError } from '@/lib/errors'
import { resolveExecutionApiKey } from '@/services/api-key-resolver.service'
import { ResolveKeyRequestSchema, type ResolveKeyResponse } from '@/types'

export const runtime = 'nodejs'

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
    normalized.length !== EXECUTION_INTERNAL.SIGNATURE_HEX_LENGTH ||
    !/^[0-9a-f]+$/.test(normalized)
  ) {
    return null
  }

  return Buffer.from(normalized, 'hex')
}

function verifyExecutionSignature(rawBody: string, request: Request) {
  const signature = request.headers.get(EXECUTION_INTERNAL.SIGNATURE_HEADER)
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
    EXECUTION_INTERNAL.SIGNATURE_ALGORITHM,
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

const resolveKeyHandler = createApiInternalRoute<
  typeof ResolveKeyRequestSchema,
  ResolveKeyResponse
>({
  schema: ResolveKeyRequestSchema,
  routeName: 'POST /api/internal/execution/resolve-key',
  verifySignature: verifyExecutionSignature,
  handler: async ({ data }) => resolveExecutionApiKey(data),
})

// ─── POST /api/internal/execution/resolve-key ────────────────────

export async function POST(request: NextRequest) {
  const response = await resolveKeyHandler(request)
  response.headers.set('Cache-Control', 'no-store')
  return response
}
