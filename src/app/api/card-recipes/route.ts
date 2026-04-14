import 'server-only'

import { z } from 'zod'

import { CreateCardRecipeSchema } from '@/types'
import {
  listCardRecipes,
  createCardRecipe,
} from '@/services/card-recipe.service'
import { createApiGetRoute, createApiRoute } from '@/lib/api-route-factory'

export const GET = createApiGetRoute({
  schema: z.object({ projectId: z.string().optional() }),
  routeName: 'GET /api/card-recipes',
  requireAuth: true,
  handler: async ({ clerkId, data }) =>
    listCardRecipes(clerkId!, data.projectId ?? null),
})

export const POST = createApiRoute({
  schema: CreateCardRecipeSchema,
  routeName: 'POST /api/card-recipes',
  handler: async (clerkId, data) => createCardRecipe(clerkId, data),
})
