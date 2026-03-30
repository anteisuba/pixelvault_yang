import { logger } from '@/lib/logger'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import type { CompileRecipeResponse } from '@/types'
import { getCardRecipe } from '@/services/card-recipe.service'
import { compileRecipe } from '@/services/recipe-compiler.service'
import { ensureUser } from '@/services/user.service'

type RouteContext = { params: Promise<{ id: string }> }

// ─── POST /api/card-recipes/[id]/compile ────────────────────────

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json<CompileRecipeResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const { id } = await context.params

    // Verify the recipe exists and belongs to this user
    const recipe = await getCardRecipe(clerkId, id)
    if (!recipe) {
      return NextResponse.json<CompileRecipeResponse>(
        { success: false, error: 'Recipe not found' },
        { status: 404 },
      )
    }

    // Resolve internal userId for the compiler
    const user = await ensureUser(clerkId)

    const compiled = await compileRecipe({
      userId: user.id,
      characterCardId: recipe.characterCardId,
      backgroundCardId: recipe.backgroundCardId,
      styleCardId: recipe.styleCardId,
      freePrompt: recipe.freePrompt,
    })

    return NextResponse.json<CompileRecipeResponse>({
      success: true,
      data: compiled,
    })
  } catch (error) {
    logger.error('[API /api/card-recipes/[id]/compile POST] Error', { error: error instanceof Error ? error.message : String(error) })
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    const status = message.startsWith('MISSING_') ? 400 : 500
    return NextResponse.json<CompileRecipeResponse>(
      { success: false, error: message },
      { status },
    )
  }
}
