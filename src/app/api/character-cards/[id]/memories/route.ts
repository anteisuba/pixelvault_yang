import 'server-only'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import {
  createApiGetByIdRoute,
  createApiPostByIdRoute,
} from '@/lib/api-route-factory'
import {
  createCharacterMemoryForClerkId,
  getCharacterMemoriesForClerkId,
} from '@/services/cards/character-growth.service'
import { CreateCharacterMemorySchema } from '@/types/assistant-memory'

/**
 * 她页「记忆」栏（角色大项目第 ⑦ 步）：读记得的 · 沉睡的 · 见闻，与「记一条」。
 * 改字 / 钉住 / 唤醒 / 删走 `/api/assistant-memories/[id]`，删见闻走 见闻那条路由。
 */
export const GET = createApiGetByIdRoute({
  routeName: 'GET /api/character-cards/[id]/memories',
  notFoundMessage: 'Character card not found',
  handler: (clerkId, id) => getCharacterMemoriesForClerkId(clerkId, id),
})

export const POST = createApiPostByIdRoute({
  schema: CreateCharacterMemorySchema,
  routeName: 'POST /api/character-cards/[id]/memories',
  notFoundMessage: 'Character card not found',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: (clerkId, id, data) =>
    createCharacterMemoryForClerkId(clerkId, id, data),
})
