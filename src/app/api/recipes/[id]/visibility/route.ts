import 'server-only'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiPatchByIdRoute } from '@/lib/api-route-factory'
import { setRecipeVisibility } from '@/services/prompts/recipe.service'
import { SetRecipeVisibilityRequestSchema } from '@/types'

export const PATCH = createApiPatchByIdRoute({
  schema: SetRecipeVisibilityRequestSchema,
  routeName: 'PATCH /api/recipes/[id]/visibility',
  notFoundMessage: 'Recipe not found',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, id, data) =>
    setRecipeVisibility(clerkId, id, data.visibility),
})
