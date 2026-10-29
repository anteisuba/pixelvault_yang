import 'server-only'

import { GoOutNowSchema } from '@/types/character-growth'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { goOutNowForClerkId } from '@/services/cards/character-growth.service'
import { createApiPostByIdRoute } from '@/lib/api-route-factory'

/** 一趟出门的时限，同定时任务那条（三级漏斗要调好几次模型）。 */
export const maxDuration = 300

/** 角色页「出门逛」打开就出门一趟（owner 2026-10-29）。 */
export const POST = createApiPostByIdRoute({
  schema: GoOutNowSchema,
  routeName: 'POST /api/character-cards/[id]/browse/now',
  notFoundMessage: 'Character card not found',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, id) => goOutNowForClerkId(clerkId, id),
})
