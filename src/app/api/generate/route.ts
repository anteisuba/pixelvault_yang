import { GenerateRequestSchema } from '@/types'
import { submitImageGeneration } from '@/services/image/submit-image.service'
import { createApiRoute } from '@/lib/api-route-factory'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'

// Next.js segment config exports must stay statically analyzable.
export const maxDuration = 60

export const POST = createApiRoute({
  schema: GenerateRequestSchema,
  rateLimit: RATE_LIMIT_CONFIGS.generate,
  routeName: 'POST /api/generate',
  handler: async (clerkId, data) => {
    return submitImageGeneration(clerkId, data)
  },
})
