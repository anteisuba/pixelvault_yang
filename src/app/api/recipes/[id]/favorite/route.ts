import 'server-only'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiPutRoute } from '@/lib/api-route-factory'
import { setRecipeFavorite } from '@/services/prompts/recipe.service'
import { SetRecipeFavoriteRequestSchema } from '@/types'

export const PUT = createApiPutRoute({
  schema: SetRecipeFavoriteRequestSchema,
  routeName: 'PUT /api/recipes/[id]/favorite',
  notFoundMessage: 'Recipe not found',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, id, data) =>
    setRecipeFavorite(clerkId, id, data.isFavorite),
})
