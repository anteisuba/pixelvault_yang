import 'server-only'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiGetRoute } from '@/lib/api-route-factory'
import { readActiveTurn } from '@/features/assistant/server'
import { AssistantActiveTurnQuerySchema } from '@/types/assistant-operator'

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
