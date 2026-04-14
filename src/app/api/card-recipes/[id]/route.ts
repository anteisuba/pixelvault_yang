import 'server-only'

import { UpdateCardRecipeSchema } from '@/types'
import {
  getCardRecipe,
  updateCardRecipe,
  deleteCardRecipe,
} from '@/services/card-recipe.service'
import {
  createApiGetByIdRoute,
  createApiPutRoute,
  createApiDeleteRoute,
} from '@/lib/api-route-factory'

export const GET = createApiGetByIdRoute({
  routeName: 'GET /api/card-recipes/[id]',
  handler: async (clerkId, id) => getCardRecipe(clerkId, id),
})

export const PUT = createApiPutRoute({
  schema: UpdateCardRecipeSchema,
  routeName: 'PUT /api/card-recipes/[id]',
  handler: async (clerkId, id, data) => updateCardRecipe(clerkId, id, data),
})

export const DELETE = createApiDeleteRoute({
  routeName: 'DELETE /api/card-recipes/[id]',
  handler: async (clerkId, id) => deleteCardRecipe(clerkId, id),
})
