import 'server-only'

import { StopCharacterOutingSchema } from '@/types/character-growth'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { stopOutingForClerkId } from '@/services/cards/character-outing.service'
import { createApiPostByIdRoute } from '@/lib/api-route-factory'

/** 那一段已经不在了就当场收工（写日记要调一次模型）。 */
export const maxDuration = 300

/** 「结束」：看到的照样留着（owner 10-30）。没在外面 → 404。 */
export const POST = createApiPostByIdRoute({
  schema: StopCharacterOutingSchema,
  routeName: 'POST /api/character-cards/[id]/outing/stop',
  notFoundMessage: 'Character outing not found',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, id) => stopOutingForClerkId(clerkId, id),
})
