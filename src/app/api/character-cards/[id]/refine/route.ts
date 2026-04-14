import 'server-only'

import { RefineCharacterCardSchema } from '@/types'
import { refineCharacterCard } from '@/services/character-refine.service'
import { createApiPostByIdRoute } from '@/lib/api-route-factory'

export const POST = createApiPostByIdRoute({
  schema: RefineCharacterCardSchema,
  routeName: 'POST /api/character-cards/[id]/refine',
  handler: async (clerkId, id, data) => refineCharacterCard(clerkId, id, data),
})
