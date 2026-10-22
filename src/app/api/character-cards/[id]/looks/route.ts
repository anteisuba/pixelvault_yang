import 'server-only'

import { CreateCharacterLookSchema } from '@/types'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiPostByIdRoute } from '@/lib/api-route-factory'
import { createCharacterLook } from '@/services/cards/character-look.service'

export const POST = createApiPostByIdRoute({
  schema: CreateCharacterLookSchema,
  routeName: 'POST /api/character-cards/[id]/looks',
  notFoundMessage: 'Character card not found',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, id, data) => createCharacterLook(clerkId, id, data),
})
