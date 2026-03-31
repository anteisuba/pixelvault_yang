import { GenerateRequestSchema } from '@/types'
import { generateImageForUser } from '@/services/generate-image.service'
import { createApiRoute } from '@/lib/api-route-factory'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'

// Next.js segment config exports must stay statically analyzable.
export const maxDuration = 240

export const POST = createApiRoute({
  schema: GenerateRequestSchema,
  rateLimit: RATE_LIMIT_CONFIGS.generate,
  routeName: 'POST /api/generate',
  handler: async (clerkId, data) => {
    const generation = await generateImageForUser(clerkId, data)
    return { generation }
  },
})
