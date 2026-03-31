import { z } from 'zod'
import { cancelPipeline } from '@/services/video-pipeline.service'
import { createApiRoute } from '@/lib/api-route-factory'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'

const CancelRequestSchema = z.object({
  pipelineId: z.string().trim().min(1),
})

export const POST = createApiRoute({
  schema: CancelRequestSchema,
  rateLimit: RATE_LIMIT_CONFIGS.longVideoCancel,
  routeName: 'POST /api/generate-long-video/cancel',
  handler: async (clerkId, data) => {
    return cancelPipeline(clerkId, data.pipelineId)
  },
})
