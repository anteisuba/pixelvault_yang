import 'server-only'

import {
  createApiDeleteRoute,
  createApiGetByIdRoute,
} from '@/lib/api-route-factory'
import { deleteRecipe, getRecipe } from '@/services/recipe.service'

export const GET = createApiGetByIdRoute({
  routeName: 'GET /api/recipes/[id]',
  notFoundMessage: 'Recipe not found',
  handler: async (clerkId, id) => getRecipe(clerkId, id),
})

export const DELETE = createApiDeleteRoute({
  routeName: 'DELETE /api/recipes/[id]',
  notFoundMessage: 'Recipe not found',
  handler: async (clerkId, id) => deleteRecipe(clerkId, id),
})
