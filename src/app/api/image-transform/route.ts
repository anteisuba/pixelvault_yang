import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiRoute } from '@/lib/api-route-factory'
import { transformImage } from '@/services/image-transform.service'
import { TransformInputSchema } from '@/types/transform'

export const maxDuration = 240

export const POST = createApiRoute({
  schema: TransformInputSchema,
  rateLimit: RATE_LIMIT_CONFIGS.imageTransform,
  routeName: 'POST /api/image-transform',
  handler: async (clerkId, data) => {
    return await transformImage(clerkId, data)
  },
})
