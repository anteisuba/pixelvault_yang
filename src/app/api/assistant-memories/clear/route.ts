import 'server-only'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiRoute } from '@/lib/api-route-factory'
import { clearAssistantMemoriesForClerkId } from '@/services/assistant-memory.service'
import { ClearAssistantMemoriesSchema } from '@/types/assistant-memory'

/**
 * 「全部清空」（56a · 记忆区右上那一行字，二次确认之后）。
 *
 * ⚠ 它是一条 **POST** 而不是集合上的 DELETE：路由工厂的 DELETE 那一支读
 * `context.params.id`，集合路由上没有 id 可给 —— ⛔ 与其为这一次调用给工厂长出
 * 第二种 DELETE，不如让这条路把自己叫什么写在 URL 上。
 * ⚠ 收一个显式的 `confirm: true`（schema）：一次删光用户全部记忆的接口，
 * ⛔ 不该被一个空 POST 触发。二次确认的**对话框**在客户端，这里是第二道闸。
 */

export const POST = createApiRoute({
  schema: ClearAssistantMemoriesSchema,
  routeName: 'POST /api/assistant-memories/clear',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId) => ({
    cleared: await clearAssistantMemoriesForClerkId(clerkId),
  }),
})
