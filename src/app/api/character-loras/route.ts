import 'server-only'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import {
  listCharacterLoraGroups,
  setLoraCharacters,
} from '@/services/cards/character-lora.service'
import { createApiGetRoute, createApiRoute } from '@/lib/api-route-factory'
import { ListCharacterLorasQuerySchema, SetLoraCharactersSchema } from '@/types'

/** 每个角色收的 LoRA（角色③）。给 `characterCardId` 只取那一位。 */
export const GET = createApiGetRoute({
  schema: ListCharacterLorasQuerySchema,
  routeName: 'GET /api/character-loras',
  requireAuth: true,
  rateLimit: RATE_LIMIT_CONFIGS.authedRead,
  handler: async ({ clerkId, data }) =>
    listCharacterLoraGroups(clerkId!, data.characterCardId),
})

/** 这个 LoRA 属于哪些角色 —— 整组替换，返回替换后所有角色的分组。 */
export const PUT = createApiRoute({
  schema: SetLoraCharactersSchema,
  routeName: 'PUT /api/character-loras',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: (clerkId, data) =>
    setLoraCharacters(clerkId, data.lora, data.characters),
})
