import 'server-only'

import { UpdateCharacterBrowseSchema } from '@/types/character-growth'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { updateCharacterBrowseForClerkId } from '@/services/cards/character-growth.service'
import { createApiPutRoute } from '@/lib/api-route-factory'

/** 角色页「出门逛」：开关与出门用的型号（owner 2026-10-28）。 */
export const PUT = createApiPutRoute({
  schema: UpdateCharacterBrowseSchema,
  routeName: 'PUT /api/character-cards/[id]/browse',
  notFoundMessage: 'Character card not found',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, id, data) =>
    updateCharacterBrowseForClerkId(clerkId, id, data),
})
