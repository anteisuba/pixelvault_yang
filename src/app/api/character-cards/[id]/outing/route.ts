import 'server-only'

import { StartCharacterOutingSchema } from '@/types/character-growth'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { startOutingForClerkId } from '@/services/cards/character-outing.service'
import { createApiPostByIdRoute } from '@/lib/api-route-factory'

/** 第一段在回完这一下之后接着跑（`after`），给足函数时限。 */
export const maxDuration = 300

/** 角色页「出门调查」弹框点「开始」（角色大项目第 ⑤ 步）：马上回这一趟，后台去逛。 */
export const POST = createApiPostByIdRoute({
  schema: StartCharacterOutingSchema,
  routeName: 'POST /api/character-cards/[id]/outing',
  notFoundMessage: 'Character card not found',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, id, data) =>
    startOutingForClerkId(clerkId, id, data),
})
