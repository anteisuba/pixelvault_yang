import 'server-only'

import { createApiGetByIdRoute } from '@/lib/api-route-factory'
import { getCharacterGrowthForClerkId } from '@/services/cards/character-growth.service'

/** 出门那一趟没人接力时，读状态这一下接着跑一段（`after`），给足函数时限。 */
export const maxDuration = 300

/** 设置「她」那一页：她的日记 + 她改了什么（C 第 3 步）。 */
export const GET = createApiGetByIdRoute({
  routeName: 'GET /api/character-cards/[id]/growth',
  notFoundMessage: 'Character card not found',
  handler: async (clerkId, id) => getCharacterGrowthForClerkId(clerkId, id),
})
