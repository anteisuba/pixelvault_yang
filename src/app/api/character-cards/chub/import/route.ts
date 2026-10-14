import 'server-only'

import { ImportChubCardSchema } from '@/types/chub-library'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { importChubCard } from '@/services/cards/chub-library.service'
import { createApiRoute } from '@/lib/api-route-factory'

/** 卡库里点一张卡 → 一张我们的角色卡。 */
export const POST = createApiRoute({
  schema: ImportChubCardSchema,
  routeName: 'POST /api/character-cards/chub/import',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, data) => importChubCard(clerkId, data),
})
