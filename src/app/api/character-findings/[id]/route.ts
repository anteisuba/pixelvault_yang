import 'server-only'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { deleteCharacterFindingForClerkId } from '@/services/cards/character-growth.service'
import { createApiDeleteRoute } from '@/lib/api-route-factory'

/** 删她的一条见闻（角色页右栏）。 */
export const DELETE = createApiDeleteRoute({
  routeName: 'DELETE /api/character-findings/[id]',
  notFoundMessage: 'Finding not found',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, id) => deleteCharacterFindingForClerkId(clerkId, id),
})
