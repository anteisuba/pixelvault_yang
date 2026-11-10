import 'server-only'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiGetRoute, createApiRoute } from '@/lib/api-route-factory'
import { linkRunningTurn, readActiveTurn } from '@/features/assistant/server'
import {
  AssistantActiveTurnQuerySchema,
  AssistantTurnLinkRequestSchema,
} from '@/types/assistant-operator'

/**
 * 这段会话此刻有没有在跑的轮（回合托管第 3 片）：刷新回来的页面先问一句，有就接回去。
 * 标记按 Clerk 用户 id 分键：别人的会话号问不出这个人的轮。
 */
export const GET = createApiGetRoute({
  schema: AssistantActiveTurnQuerySchema,
  routeName: 'GET /api/studio/assistant-operator/active',
  requireAuth: true,
  rateLimit: RATE_LIMIT_CONFIGS.authedRead,
  cacheHeader: 'private, no-store',
  handler: async ({ clerkId, data }) => ({
    active: await readActiveTurn(clerkId!, data.conversationId),
  }),
})

/**
 * 新会话的第一轮途中才拿到会话号（回合托管第 4 片）：把这一轮记成这段会话在跑的轮。
 * 只认这个人还在跑的轮（`linkRunningTurn` 自己查）；会话号只用来分键，⛔ 不读别人的东西。
 */
export const POST = createApiRoute({
  schema: AssistantTurnLinkRequestSchema,
  routeName: 'POST /api/studio/assistant-operator/active',
  handler: async (clerkId, data) => ({
    linked: await linkRunningTurn(clerkId, data),
  }),
})
