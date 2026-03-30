import { LongVideoRequestSchema } from '@/types'
import { createLongVideoPipeline } from '@/services/video-pipeline.service'
import { createApiRoute } from '@/lib/api-route-factory'
import { MAX_DURATION_CONFIGS, RATE_LIMIT_CONFIGS } from '@/constants/config'

export const maxDuration = MAX_DURATION_CONFIGS.generateLongVideo

export const POST = createApiRoute({
  schema: LongVideoRequestSchema,
  rateLimit: RATE_LIMIT_CONFIGS.generateLongVideo,
  routeName: 'POST /api/generate-long-video',
  handler: async (clerkId, data) => {
    return createLongVideoPipeline(clerkId, data)
  },
})
