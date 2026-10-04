import 'server-only'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiGetRoute, createApiRoute } from '@/lib/api-route-factory'
import { ApiRequestError } from '@/lib/errors'
import {
  AssistantMemoryLimitError,
  createCreatorMemoryForClerkId,
  listAssistantMemoriesForClerkId,
} from '@/services/assistant-memory.service'
import {
  CreateAssistantMemorySchema,
  ListAssistantMemoriesQuerySchema,
} from '@/types/assistant-memory'

/**
 * 助手记忆的集合路由（56a · 助手设置 B）—— 读全部，与「你写一条」。
 *
 * ⚠ POST 只写**你写的**（`creator`）：助手记的唯一写入口仍是每轮结账（服务端）。
 * ⚠ 清空在 `clear/route.ts`：路由工厂的 DELETE 那一支是**按 id** 的
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
      ...(data.workspaceKey ? { workspaceKey: data.workspaceKey } : {}),
    }),
})

export const POST = createApiRoute({
  schema: CreateAssistantMemorySchema,
  routeName: 'POST /api/assistant-memories',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, data) => {
    try {
      return await createCreatorMemoryForClerkId(clerkId, data)
    } catch (error) {
      if (error instanceof AssistantMemoryLimitError) {
        throw new ApiRequestError(
          'ASSISTANT_MEMORY_LIMIT_REACHED',
          409,
          'errors.assistantMemory.limitReached',
          error.message,
        )
      }
      throw error
    }
  },
})
