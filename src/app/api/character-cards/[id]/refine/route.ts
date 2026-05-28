import 'server-only'

import { RefineCharacterCardSchema } from '@/types'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { refineCharacterCard } from '@/services/cards/character-refine.service'
import { createApiPostByIdRoute } from '@/lib/api-route-factory'

export const POST = createApiPostByIdRoute({
  schema: RefineCharacterCardSchema,
  routeName: 'POST /api/character-cards/[id]/refine',
  rateLimit: RATE_LIMIT_CONFIGS.promptAssistant,
  handler: async (clerkId, id, data) => refineCharacterCard(clerkId, id, data),
})
