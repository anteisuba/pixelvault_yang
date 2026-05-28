import 'server-only'

import { z } from 'zod'

import { CreateCardRecipeSchema } from '@/types'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import {
  listCardRecipes,
  createCardRecipe,
} from '@/services/cards/card-recipe.service'
import { createApiGetRoute, createApiRoute } from '@/lib/api-route-factory'

export const GET = createApiGetRoute({
  schema: z.object({ projectId: z.string().optional() }),
  routeName: 'GET /api/card-recipes',
  requireAuth: true,
  rateLimit: RATE_LIMIT_CONFIGS.authedRead,
  handler: async ({ clerkId, data }) =>
    listCardRecipes(clerkId!, data.projectId ?? null),
})

export const POST = createApiRoute({
  schema: CreateCardRecipeSchema,
  routeName: 'POST /api/card-recipes',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, data) => createCardRecipe(clerkId, data),
})
