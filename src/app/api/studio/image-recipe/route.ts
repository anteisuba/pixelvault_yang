import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiRoute } from '@/lib/api-route-factory'
import {
  readImageRecipe,
  readLibraryImageRecipe,
} from '@/services/image-recipe.service'
import { ImageRecipeReadRequestSchema } from '@/types/image-recipe'

// 没配方时要等 Tagger：热着约 5 秒，冷启动几十秒（IMAGE_TAGGER.TIMEOUT_MS）。
export const maxDuration = 120

export const POST = createApiRoute({
  schema: ImageRecipeReadRequestSchema,
  rateLimit: RATE_LIMIT_CONFIGS.assetUpload,
  routeName: 'POST /api/studio/image-recipe',
  handler: async (clerkId, data) => {
    return 'generationId' in data
      ? await readLibraryImageRecipe(clerkId, data.generationId)
      : await readImageRecipe(clerkId, data.storageKey)
  },
})
