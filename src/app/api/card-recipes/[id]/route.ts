import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import { UpdateCardRecipeSchema } from '@/types'
import type { CardRecipeResponse } from '@/types'
import {
  getCardRecipe,
  updateCardRecipe,
  deleteCardRecipe,
} from '@/services/card-recipe.service'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json<CardRecipeResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const { id } = await context.params
    const recipe = await getCardRecipe(clerkId, id)
    if (!recipe) {
      return NextResponse.json<CardRecipeResponse>(
        { success: false, error: 'Not found' },
        { status: 404 },
      )
    }

    return NextResponse.json<CardRecipeResponse>({
      success: true,
      data: recipe,
    })
  } catch (error) {
    console.error('[API /api/card-recipes/[id] GET] Error:', error)
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return NextResponse.json<CardRecipeResponse>(
      { success: false, error: message },
      { status: 500 },
    )
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json<CardRecipeResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const { id } = await context.params
    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json<CardRecipeResponse>(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 },
      )
    }

    const parseResult = UpdateCardRecipeSchema.safeParse(body)
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

    const recipe = await updateCardRecipe(clerkId, id, parseResult.data)
    return NextResponse.json<CardRecipeResponse>({
      success: true,
      data: recipe,
    })
  } catch (error) {
    console.error('[API /api/card-recipes/[id] PUT] Error:', error)
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return NextResponse.json<CardRecipeResponse>(
      { success: false, error: message },
      { status: 500 },
    )
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const { id } = await context.params
    await deleteCardRecipe(clerkId, id)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[API /api/card-recipes/[id] DELETE] Error:', error)
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
