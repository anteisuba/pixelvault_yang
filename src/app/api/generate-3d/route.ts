import { Generate3DRequestSchema } from '@/types'
import { submit3DGeneration } from '@/services/generate-3d.service'
import { createApiRoute } from '@/lib/api-route-factory'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'

export const maxDuration = 240

export const POST = createApiRoute({
  schema: Generate3DRequestSchema,
  rateLimit: RATE_LIMIT_CONFIGS.generateVideo,
  routeName: 'POST /api/generate-3d',
  handler: async (clerkId, data) => {
    return submit3DGeneration(clerkId, data)
  },
})
