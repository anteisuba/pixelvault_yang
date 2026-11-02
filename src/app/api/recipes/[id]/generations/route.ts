import 'server-only'

import { createApiGetByIdRoute } from '@/lib/api-route-factory'
import { listRecipeGenerations } from '@/features/prompts/server'

export const GET = createApiGetByIdRoute({
  routeName: 'GET /api/recipes/[id]/generations',
  handler: async (clerkId, id) => listRecipeGenerations(clerkId, id),
})
