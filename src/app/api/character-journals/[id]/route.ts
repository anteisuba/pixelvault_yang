import 'server-only'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import {
  deleteCharacterJournalForClerkId,
  updateCharacterJournalForClerkId,
} from '@/services/cards/character-growth.service'
import {
  createApiDeleteRoute,
  createApiPutRoute,
} from '@/lib/api-route-factory'
import { UpdateCharacterJournalSchema } from '@/types/character-growth'

/** 改她的一篇日记（角色页「最近」，第 ③ 步）。 */
export const PUT = createApiPutRoute({
  schema: UpdateCharacterJournalSchema,
  routeName: 'PUT /api/character-journals/[id]',
  notFoundMessage: 'Journal not found',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, id, data) =>
    updateCharacterJournalForClerkId(clerkId, id, data),
})

/** 删她的一篇日记。 */
export const DELETE = createApiDeleteRoute({
  routeName: 'DELETE /api/character-journals/[id]',
  notFoundMessage: 'Journal not found',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, id) => deleteCharacterJournalForClerkId(clerkId, id),
})
