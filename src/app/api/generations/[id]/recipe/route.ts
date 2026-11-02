import 'server-only'

import { readGenerationRecipe } from '@/services/generation-recipe.service'
import { ensureUser } from '@/services/user.service'
import { createApiGetByIdRoute } from '@/lib/api-route-factory'
import type { GenerationRecipeRead } from '@/types/generation-recipe'

/**
 * 本人作品的生成配方（p-auto-recipe）：新作品读出图时记下的那份，旧作品从旧快照现补，
 * 补不全的写进 `gaps`。别人的作品不给（画廊「做同款」另走公开部分）。
 */
export const GET = createApiGetByIdRoute<GenerationRecipeRead>({
  routeName: 'GET /api/generations/[id]/recipe',
  notFoundMessage: 'Generation not found or access denied',
  handler: async (clerkId, id) => {
    const user = await ensureUser(clerkId)
    return readGenerationRecipe(id, user.id)
  },
})
