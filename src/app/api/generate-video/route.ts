import { GenerateVideoRequestSchema } from '@/types'
import { submitVideoGeneration } from '@/services/generate-video.service'
import { createApiRoute } from '@/lib/api-route-factory'
import { MAX_DURATION_CONFIGS, RATE_LIMIT_CONFIGS } from '@/constants/config'

export const maxDuration = MAX_DURATION_CONFIGS.generateVideo

export const POST = createApiRoute({
  schema: GenerateVideoRequestSchema,
  rateLimit: RATE_LIMIT_CONFIGS.generateVideo,
  routeName: 'POST /api/generate-video',
  handler: async (clerkId, data) => {
    return submitVideoGeneration(clerkId, data)
  },
})
