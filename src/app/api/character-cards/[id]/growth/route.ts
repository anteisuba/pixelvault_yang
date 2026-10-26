import 'server-only'

import { createApiGetByIdRoute } from '@/lib/api-route-factory'
import { getCharacterGrowthForClerkId } from '@/services/cards/character-growth.service'

/** 设置「她」那一页：她的日记 + 她改了什么（C 第 3 步）。 */
export const GET = createApiGetByIdRoute({
  routeName: 'GET /api/character-cards/[id]/growth',
  notFoundMessage: 'Character card not found',
  handler: async (clerkId, id) => getCharacterGrowthForClerkId(clerkId, id),
})
