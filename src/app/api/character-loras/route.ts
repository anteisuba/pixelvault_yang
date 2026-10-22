import 'server-only'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { listCharacterLoraGroups } from '@/services/cards/character-lora.service'
import { createApiGetRoute } from '@/lib/api-route-factory'
import { ListCharacterLorasQuerySchema } from '@/types'

/** 每个角色收的 LoRA（角色③）。给 `characterCardId` 只取那一位。 */
export const GET = createApiGetRoute({
  schema: ListCharacterLorasQuerySchema,
  routeName: 'GET /api/character-loras',
  requireAuth: true,
  rateLimit: RATE_LIMIT_CONFIGS.authedRead,
  handler: async ({ clerkId, data }) =>
    listCharacterLoraGroups(clerkId!, data.characterCardId),
})
