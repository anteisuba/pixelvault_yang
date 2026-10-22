import 'server-only'

import { DuplicateCharacterCardSchema } from '@/types'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiPostByIdRoute } from '@/lib/api-route-factory'
import { duplicateCharacterCard } from '@/services/cards/character-card.service'

export const POST = createApiPostByIdRoute({
  schema: DuplicateCharacterCardSchema,
  routeName: 'POST /api/character-cards/[id]/duplicate',
  notFoundMessage: 'Character card not found',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, id, data) =>
    duplicateCharacterCard(clerkId, id, data.name),
})
