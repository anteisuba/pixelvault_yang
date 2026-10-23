import 'server-only'

import type { NextRequest } from 'next/server'

import { createApiInternalRoute } from '@/lib/api-route-factory'
import { verifyInternalExecutionSignature } from '@/lib/signature-verifiers/internal-execution'
import { acquireExecutionSlot } from '@/services/execution-slot.service'
import { ExecutionSlotRequestSchema, type ExecutionSlotResponse } from '@/types'

export const runtime = 'nodejs'

const slotHandler = createApiInternalRoute<
  typeof ExecutionSlotRequestSchema,
  ExecutionSlotResponse
>({
  schema: ExecutionSlotRequestSchema,
  routeName: 'POST /api/internal/execution/slot',
  verifySignature: verifyInternalExecutionSignature,
  handler: async ({ data }) => acquireExecutionSlot(data),
})

// ─── POST /api/internal/execution/slot ───────────────────────────

export async function POST(request: NextRequest) {
  const response = await slotHandler(request)
  response.headers.set('Cache-Control', 'no-store')
  return response
}
