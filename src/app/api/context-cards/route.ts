import 'server-only'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { CONTEXT_CARD_LIMITS } from '@/constants/context-cards'
import { createApiGetRoute, createApiRoute } from '@/lib/api-route-factory'
import { ApiRequestError } from '@/lib/errors'
import {
  ContextCardLimitError,
  createContextCardForClerkId,
  listContextCardsForClerkId,
} from '@/services/context-cards.service'
import {
  CreateContextCardSchema,
  ListContextCardsQuerySchema,
} from '@/types/context-cards'

/**
 * 上下文卡的集合路由（第三期 K1）。
 *
 * ⚠ 新卡永远**从零张参考图开始** —— 图走 `[id]/images` 那条腿，因为它要写 R2，
 * 而这条路上一个字节都不该落地（判据与 persona 头像分腿同源）。
 */

export const GET = createApiGetRoute({
  schema: ListContextCardsQuerySchema,
  routeName: 'GET /api/context-cards',
  requireAuth: true,
  rateLimit: RATE_LIMIT_CONFIGS.authedRead,
  handler: async ({ clerkId, data }) =>
    listContextCardsForClerkId(clerkId!, {
      kind: data.kind ?? null,
      pinnedScope: data.pinnedScope ?? null,
    }),
})

export const POST = createApiRoute({
  schema: CreateContextCardSchema,
  routeName: 'POST /api/context-cards',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, data) => {
    try {
      return await createContextCardForClerkId(clerkId, data)
    } catch (error) {
      if (error instanceof ContextCardLimitError) {
        throw new ApiRequestError(
          'CONTEXT_CARD_LIMIT_REACHED',
          409,
          'errors.contextCard.limitReached',
          `Context card limit reached (${CONTEXT_CARD_LIMITS.maxPerUser})`,
        )
      }
      throw error
    }
  },
})
