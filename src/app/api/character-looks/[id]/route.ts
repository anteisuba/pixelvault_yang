import 'server-only'

import { UpdateCharacterLookSchema } from '@/types'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import {
  createApiDeleteRoute,
  createApiPutRoute,
} from '@/lib/api-route-factory'
import {
  deleteCharacterLook,
  updateCharacterLook,
} from '@/services/cards/character-look.service'

export const PUT = createApiPutRoute({
  schema: UpdateCharacterLookSchema,
  routeName: 'PUT /api/character-looks/[id]',
  notFoundMessage: 'Look not found',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, id, data) => updateCharacterLook(clerkId, id, data),
})

/** 删完客户端在手里那份里照同一条规则让位（排最前的接任默认），⛔ 不再拉一次。 */
export const DELETE = createApiDeleteRoute({
  routeName: 'DELETE /api/character-looks/[id]',
  notFoundMessage: 'Look not found',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, id) => {
    await deleteCharacterLook(clerkId, id)
    return true
  },
})
