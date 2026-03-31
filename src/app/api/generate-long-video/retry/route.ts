import { z } from 'zod'
import { retryPipelineClip } from '@/services/video-pipeline.service'
import { createApiRoute } from '@/lib/api-route-factory'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'

const RetryRequestSchema = z.object({
  pipelineId: z.string().trim().min(1),
  clipIndex: z.number().int().min(0),
})

export const POST = createApiRoute({
  schema: RetryRequestSchema,
  rateLimit: RATE_LIMIT_CONFIGS.longVideoRetry,
  routeName: 'POST /api/generate-long-video/retry',
  handler: async (clerkId, data) => {
    return retryPipelineClip(clerkId, data.pipelineId, data.clipIndex)
  },
})
