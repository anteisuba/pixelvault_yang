import 'server-only'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiPutRoute } from '@/lib/api-route-factory'
import { markRecipeUsed } from '@/services/prompts/recipe.service'
import { MarkRecipeUsedRequestSchema } from '@/types'

export const POST = createApiPutRoute({
  schema: MarkRecipeUsedRequestSchema,
  routeName: 'POST /api/recipes/[id]/use',
  notFoundMessage: 'Recipe not found',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, id) => markRecipeUsed(clerkId, id),
})
