import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiRoute } from '@/lib/api-route-factory'
import { prepareImageRecipeUpload } from '@/services/image-recipe.service'
import { ImageRecipePrepareRequestSchema } from '@/types/image-recipe'

export const maxDuration = 10

export const POST = createApiRoute({
  schema: ImageRecipePrepareRequestSchema,
  rateLimit: RATE_LIMIT_CONFIGS.assetUpload,
  routeName: 'POST /api/studio/image-recipe/prepare',
  handler: async (clerkId, data) => {
    return await prepareImageRecipeUpload(clerkId, data)
  },
})
