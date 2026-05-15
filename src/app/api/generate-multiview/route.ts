import { MultiViewGenerateRequestSchema } from '@/types'
import { generateMultiView } from '@/services/multiview-generate.service'
import { createApiRoute } from '@/lib/api-route-factory'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'

// Next.js segment config exports must stay statically analyzable.
export const maxDuration = 240

export const POST = createApiRoute({
  schema: MultiViewGenerateRequestSchema,
  rateLimit: RATE_LIMIT_CONFIGS.generate,
  routeName: 'POST /api/generate-multiview',
  handler: async (clerkId, data) => {
    return generateMultiView(clerkId, data)
  },
})
