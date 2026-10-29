import 'server-only'

import { ImportTavernCardSchema } from '@/types/tavern-card'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { importTavernCard } from '@/services/cards/tavern-card-import.service'
import { createApiRoute } from '@/lib/api-route-factory'

/** 导入酒馆卡第二步：文件已直传到 R2，从那儿读回来建成一张角色卡（附录J ⑥）。 */
export const POST = createApiRoute({
  schema: ImportTavernCardSchema,
  routeName: 'POST /api/character-cards/import',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, data) => importTavernCard(clerkId, data),
})
