import 'server-only'

import { ImportTavernCardSchema } from '@/types/tavern-card'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { importTavernCard } from '@/services/cards/tavern-card-import.service'
import { createApiRoute } from '@/lib/api-route-factory'

/** 导入一张酒馆卡（PNG / JSON）→ 一张角色卡（附录J ⑥）。 */
export const POST = createApiRoute({
  schema: ImportTavernCardSchema,
  routeName: 'POST /api/character-cards/import',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, data) => importTavernCard(clerkId, data),
})
