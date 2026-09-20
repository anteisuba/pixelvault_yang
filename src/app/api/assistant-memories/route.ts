import 'server-only'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiGetRoute } from '@/lib/api-route-factory'
import { listAssistantMemoriesForClerkId } from '@/services/assistant-memory.service'
import { ListAssistantMemoriesQuerySchema } from '@/types/assistant-memory'

/**
 * 助手记忆的集合路由（56a）—— 只有一条读。
 *
 * ⚠ **没有 POST**：记忆唯一的写入口是每轮结账（服务端），⛔ 客户端不许凭空
 * 插一条。设置页上用户能做的只有改一行、删一行、全清空。
 * ⚠ 「全部清空」在 `clear/route.ts`：路由工厂的 DELETE 那一支是**按 id** 的
 * （它读 `context.params`），集合上没有 id 可给。
 */

export const GET = createApiGetRoute({
  schema: ListAssistantMemoriesQuerySchema,
  routeName: 'GET /api/assistant-memories',
  requireAuth: true,
  rateLimit: RATE_LIMIT_CONFIGS.authedRead,
  handler: async ({ clerkId, data }) =>
    listAssistantMemoriesForClerkId(clerkId!, {
      /** ⚠ 缺席 = 全部（chip 默认那一档），⛔ 不悄悄只给某个域。 */
      scope: data.scope ?? null,
    }),
})
