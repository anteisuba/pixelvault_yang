import 'server-only'

import { CreateRecipeFromGenerationSchema } from '@/types'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiRoute } from '@/lib/api-route-factory'
import { createRecipeFromGeneration } from '@/services/recipe.service'

export const POST = createApiRoute({
  schema: CreateRecipeFromGenerationSchema,
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  routeName: 'POST /api/recipes/from-generation',
  handler: async (clerkId, data) => createRecipeFromGeneration(clerkId, data),
})
