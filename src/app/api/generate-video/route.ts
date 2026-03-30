import { GenerateVideoRequestSchema } from '@/types'
import { submitVideoGeneration } from '@/services/generate-video.service'
import { createApiRoute } from '@/lib/api-route-factory'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'

export const maxDuration = 240

export const POST = createApiRoute({
  schema: GenerateVideoRequestSchema,
  rateLimit: RATE_LIMIT_CONFIGS.generateVideo,
  routeName: 'POST /api/generate-video',
  handler: async (clerkId, data) => {
    return submitVideoGeneration(clerkId, data)
  },
})
