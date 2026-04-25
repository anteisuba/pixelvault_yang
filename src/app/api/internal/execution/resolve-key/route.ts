import 'server-only'

import type { NextRequest } from 'next/server'

import { createApiInternalRoute } from '@/lib/api-route-factory'
import { verifyInternalExecutionSignature } from '@/lib/signature-verifiers/internal-execution'
import { resolveExecutionApiKey } from '@/services/api-key-resolver.service'
import { ResolveKeyRequestSchema, type ResolveKeyResponse } from '@/types'

export const runtime = 'nodejs'

const resolveKeyHandler = createApiInternalRoute<
  typeof ResolveKeyRequestSchema,
  ResolveKeyResponse
>({
  schema: ResolveKeyRequestSchema,
  routeName: 'POST /api/internal/execution/resolve-key',
  verifySignature: verifyInternalExecutionSignature,
  handler: async ({ data }) => resolveExecutionApiKey(data),
})

// ─── POST /api/internal/execution/resolve-key ────────────────────

export async function POST(request: NextRequest) {
  const response = await resolveKeyHandler(request)
  response.headers.set('Cache-Control', 'no-store')
  return response
}
