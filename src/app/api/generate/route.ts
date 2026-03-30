import { GenerateRequestSchema } from '@/types'
import { generateImageForUser } from '@/services/generate-image.service'
import { createApiRoute } from '@/lib/api-route-factory'
import { RATE_LIMIT_CONFIGS, MAX_DURATION_CONFIGS } from '@/constants/config'

export const maxDuration = MAX_DURATION_CONFIGS.generate

export const POST = createApiRoute({
  schema: GenerateRequestSchema,
  rateLimit: RATE_LIMIT_CONFIGS.generate,
  routeName: 'POST /api/generate',
  handler: async (clerkId, data) => {
    const generation = await generateImageForUser(clerkId, data)
    return { generation }
  },
})
