import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import { CreateCardRecipeSchema } from '@/types'
import type { CardRecipesResponse, CardRecipeResponse } from '@/types'
import {
  listCardRecipes,
  createCardRecipe,
} from '@/services/card-recipe.service'

export async function GET(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json<CardRecipesResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const projectId = request.nextUrl.searchParams.get('projectId')
    const recipes = await listCardRecipes(clerkId, projectId)
    return NextResponse.json<CardRecipesResponse>({
      success: true,
      data: recipes,
    })
  } catch (error) {
    console.error('[API /api/card-recipes GET] Error:', error)
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return NextResponse.json<CardRecipesResponse>(
      { success: false, error: message },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json<CardRecipeResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json<CardRecipeResponse>(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 },
      )
    }

    const parseResult = CreateCardRecipeSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json<CardRecipeResponse>(
        {
          success: false,
          error: parseResult.error.issues
            .map((e: { message: string }) => e.message)
            .join(', '),
        },
        { status: 400 },
      )
    }

    const recipe = await createCardRecipe(clerkId, parseResult.data)
    return NextResponse.json<CardRecipeResponse>({
      success: true,
      data: recipe,
    })
  } catch (error) {
    console.error('[API /api/card-recipes POST] Error:', error)
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return NextResponse.json<CardRecipeResponse>(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
