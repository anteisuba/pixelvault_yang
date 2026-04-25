import 'server-only'

import { createApiInternalRoute } from '@/lib/api-route-factory'
import { verifyInternalExecutionSignature } from '@/lib/signature-verifiers/internal-execution'
import { ExecutionCallbackPayloadSchema } from '@/types'
import {
  handleExecutionCallback,
  type CallbackResult,
} from '@/services/execution-callback.service'

export const runtime = 'nodejs'

// ─── POST /api/internal/execution/callback ───────────────────────

export const POST = createApiInternalRoute<
  typeof ExecutionCallbackPayloadSchema,
  CallbackResult
>({
  schema: ExecutionCallbackPayloadSchema,
  routeName: 'POST /api/internal/execution/callback',
  verifySignature: verifyInternalExecutionSignature,
  handler: async ({ data }) => {
    return handleExecutionCallback(data)
  },
})
