import 'server-only'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiGetRoute } from '@/lib/api-route-factory'
import { listCharacterRecentActivityForClerkId } from '@/services/cards/character-growth.service'
import { ListCharacterRecentActivityQuerySchema } from '@/types/character-growth'

/** 角色总览「最近」：每位最近一件事，最多三位（角色大项目第 ① 步）。 */
export const GET = createApiGetRoute({
  schema: ListCharacterRecentActivityQuerySchema,
  routeName: 'GET /api/character-cards/recent',
  requireAuth: true,
  rateLimit: RATE_LIMIT_CONFIGS.authedRead,
  handler: async ({ clerkId }) =>
    listCharacterRecentActivityForClerkId(clerkId!),
})
