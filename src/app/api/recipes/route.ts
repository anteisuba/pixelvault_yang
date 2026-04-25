import 'server-only'

import { NextRequest, NextResponse } from 'next/server'

import { createApiGetRoute, createApiRoute } from '@/lib/api-route-factory'
import { createRecipe, listRecipes } from '@/services/recipe.service'
import { CreateRecipeRequestSchema, ListRecipesQuerySchema } from '@/types'

const createRecipeRoute = createApiRoute({
  schema: CreateRecipeRequestSchema,
  routeName: 'POST /api/recipes',
  handler: async (clerkId, data) => createRecipe(clerkId, data),
})

export async function POST(request: NextRequest) {
  const response = await createRecipeRoute(request)
  if (response.status !== 200) return response

  const body: unknown = await response.json()
  return NextResponse.json(body, { status: 201 })
}

export const GET = createApiGetRoute({
  schema: ListRecipesQuerySchema,
  routeName: 'GET /api/recipes',
  requireAuth: true,
  handler: async ({ clerkId, data }) =>
    listRecipes(clerkId!, data.page, data.limit),
})
