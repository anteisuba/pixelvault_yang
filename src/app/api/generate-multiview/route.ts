import { MultiViewGenerateRequestSchema } from '@/types'
import { generateMultiView } from '@/services/multiview-generate.service'
import { createApiRoute } from '@/lib/api-route-factory'
import { RATE_LIMIT_CONFIGS, MAX_DURATION_CONFIGS } from '@/constants/config'

export const maxDuration = MAX_DURATION_CONFIGS.generate

export const POST = createApiRoute({
  schema: MultiViewGenerateRequestSchema,
  rateLimit: RATE_LIMIT_CONFIGS.generate,
  routeName: 'POST /api/generate-multiview',
  handler: async (clerkId, data) => {
    return generateMultiView(clerkId, data)
  },
})
