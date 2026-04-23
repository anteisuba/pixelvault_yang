import 'server-only'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiGetRoute } from '@/lib/api-route-factory'
import { checkPipelineStatus } from '@/services/video-pipeline.service'
import {
  LongVideoStatusRequestSchema,
  type PipelineStatusRecord,
} from '@/types'

export const maxDuration = 240

export const GET = createApiGetRoute<
  typeof LongVideoStatusRequestSchema,
  PipelineStatusRecord
>({
  schema: LongVideoStatusRequestSchema,
  routeName: 'GET /api/generate-long-video/status',
  requireAuth: true,
  rateLimit: RATE_LIMIT_CONFIGS.longVideoStatus,
  handler: async ({ clerkId, data }) => {
    return checkPipelineStatus(clerkId!, data.pipelineId)
  },
})
