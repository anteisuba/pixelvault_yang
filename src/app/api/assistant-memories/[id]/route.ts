import 'server-only'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import {
  createApiDeleteRoute,
  createApiPatchByIdRoute,
} from '@/lib/api-route-factory'
import {
  deleteAssistantMemoryForClerkId,
  updateAssistantMemoryForClerkId,
} from '@/services/assistant-memory.service'
import { UpdateAssistantMemorySchema } from '@/types/assistant-memory'

/**
 * 单条记忆（56a）—— 就地改那一下与行尾那颗「删」。
 *
 * ⚠ ownership 在服务端：两条服务都按 `userId` 收敛，不属于这个用户时回
 * `null` / `false`，工厂据此出 404。⛔ 不把「删了别人的」与「什么都没删」
 * 混成同一个成功。
 * ⚠ 删是**真删**（画板：行尾唯一动作「删」，真删），⛔ 不做软删、不做回收站。
 */

export const PATCH = createApiPatchByIdRoute({
  schema: UpdateAssistantMemorySchema,
  routeName: 'PATCH /api/assistant-memories/[id]',
  notFoundMessage: 'Assistant memory not found',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, id, data) =>
    updateAssistantMemoryForClerkId(clerkId, id, data.text),
})

export const DELETE = createApiDeleteRoute({
  routeName: 'DELETE /api/assistant-memories/[id]',
  notFoundMessage: 'Assistant memory not found',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, id) => deleteAssistantMemoryForClerkId(clerkId, id),
})
