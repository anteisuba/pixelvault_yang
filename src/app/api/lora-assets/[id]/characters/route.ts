import 'server-only'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { setLoraCharacters } from '@/services/cards/character-lora.service'
import { createApiPutRoute } from '@/lib/api-route-factory'
import { SetLoraCharactersSchema } from '@/types'

/** 这个 LoRA 属于哪些角色 —— 整组替换，返回替换后所有角色的分组。 */
export const PUT = createApiPutRoute({
  schema: SetLoraCharactersSchema,
  routeName: 'PUT /api/lora-assets/[id]/characters',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: (clerkId, id, data) =>
    setLoraCharacters(clerkId, id, data.characterCardIds),
})
