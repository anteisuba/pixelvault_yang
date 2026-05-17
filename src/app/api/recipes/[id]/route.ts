import 'server-only'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { CreateRecipeRequestSchema } from '@/types'
import {
  createApiDeleteRoute,
  createApiGetByIdRoute,
  createApiPatchByIdRoute,
} from '@/lib/api-route-factory'
import {
  deleteRecipe,
  getRecipe,
  updateRecipe,
} from '@/services/recipe.service'

export const GET = createApiGetByIdRoute({
  routeName: 'GET /api/recipes/[id]',
  notFoundMessage: 'Recipe not found',
  handler: async (clerkId, id) => getRecipe(clerkId, id),
})

export const DELETE = createApiDeleteRoute({
  routeName: 'DELETE /api/recipes/[id]',
  notFoundMessage: 'Recipe not found',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, id) => deleteRecipe(clerkId, id),
})

export const PATCH = createApiPatchByIdRoute({
  schema: CreateRecipeRequestSchema,
  routeName: 'PATCH /api/recipes/[id]',
  notFoundMessage: 'Recipe not found',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, id, data) => updateRecipe(clerkId, id, data),
})
