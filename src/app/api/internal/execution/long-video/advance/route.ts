import 'server-only'

import { createApiInternalRoute } from '@/lib/api-route-factory'
import { verifyInternalExecutionSignature } from '@/lib/signature-verifiers/internal-execution'
import {
  LongVideoPipelineAdvanceRequestSchema,
  type PipelineStatusRecord,
} from '@/types'
import { applyLongVideoPipelineWorkerUpdate } from '@/services/video-pipeline.service'

export const runtime = 'nodejs'
export const maxDuration = 240

export const POST = createApiInternalRoute<
  typeof LongVideoPipelineAdvanceRequestSchema,
  PipelineStatusRecord
>({
  schema: LongVideoPipelineAdvanceRequestSchema,
  routeName: 'POST /api/internal/execution/long-video/advance',
  verifySignature: verifyInternalExecutionSignature,
  handler: async ({ data }) => {
    return applyLongVideoPipelineWorkerUpdate(data)
  },
})
