import 'server-only'

import { ChubSearchQuerySchema } from '@/types/chub-library'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { searchChubCards } from '@/services/cards/chub-library.service'
import { createApiGetRoute } from '@/lib/api-route-factory'

/** 卡库：搜 chub.ai 上的酒馆卡（角色页「卡库」页签）。 */
export const GET = createApiGetRoute({
  schema: ChubSearchQuerySchema,
  routeName: 'GET /api/character-cards/chub',
  requireAuth: true,
  rateLimit: RATE_LIMIT_CONFIGS.authedRead,
  handler: async ({ data }) => searchChubCards(data),
})
