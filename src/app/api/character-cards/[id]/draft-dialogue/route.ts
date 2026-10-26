import 'server-only'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiPostByIdRoute } from '@/lib/api-route-factory'
import { draftCharacterDialogue } from '@/services/cards/character-sample-lines.service'
import { CharacterDialogueDraftRequestSchema } from '@/types'

export const POST = createApiPostByIdRoute({
  schema: CharacterDialogueDraftRequestSchema,
  routeName: 'POST /api/character-cards/[id]/draft-dialogue',
  rateLimit: RATE_LIMIT_CONFIGS.promptAssistant,
  handler: async (clerkId, id, data) =>
    draftCharacterDialogue(clerkId, id, data.kind),
})
