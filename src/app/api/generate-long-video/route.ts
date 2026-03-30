import { LongVideoRequestSchema } from '@/types'
import { createLongVideoPipeline } from '@/services/video-pipeline.service'
import { createApiRoute } from '@/lib/api-route-factory'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'

export const maxDuration = 240

export const POST = createApiRoute({
  schema: LongVideoRequestSchema,
  rateLimit: RATE_LIMIT_CONFIGS.generateLongVideo,
  routeName: 'POST /api/generate-long-video',
  handler: async (clerkId, data) => {
    return createLongVideoPipeline(clerkId, data)
  },
})
