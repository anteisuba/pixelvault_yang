import 'server-only'

import { z } from 'zod'

import { ApiRequestError } from '@/lib/errors'
import { ensureUser } from '@/services/user.service'
import { getCardRecipe } from '@/services/card-recipe.service'
import { compileRecipe } from '@/services/recipe-compiler.service'
import { createApiPostByIdRoute } from '@/lib/api-route-factory'

export const POST = createApiPostByIdRoute({
  schema: z.object({}),
  routeName: 'POST /api/card-recipes/[id]/compile',
  handler: async (clerkId, id) => {
    const recipe = await getCardRecipe(clerkId, id)
    if (!recipe) {
      throw new ApiRequestError(
        'NOT_FOUND',
        404,
        'errors.notFound',
        'Recipe not found',
      )
    }

    const user = await ensureUser(clerkId)

    try {
      return await compileRecipe({
        userId: user.id,
        characterCardId: recipe.characterCardId,
        backgroundCardId: recipe.backgroundCardId,
        styleCardId: recipe.styleCardId,
        freePrompt: recipe.freePrompt,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Compile failed'
      const status = message.startsWith('MISSING_') ? 400 : 500
      throw new ApiRequestError(
        status === 400 ? 'MISSING_DATA' : 'COMPILE_FAILED',
        status,
        status === 400
          ? 'errors.cardRecipes.missingData'
          : 'errors.cardRecipes.compileFailed',
        message,
      )
    }
  },
})
