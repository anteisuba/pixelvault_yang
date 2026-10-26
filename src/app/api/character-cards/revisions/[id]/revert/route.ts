import 'server-only'

import { z } from 'zod'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiPostByIdRoute } from '@/lib/api-route-factory'
import { revertCharacterRevisionForClerkId } from '@/services/cards/character-growth.service'

/** 「她改了什么」里撤回一条：只把那一条改过的几格写回旧值（C 第 3 步）。 */
export const POST = createApiPostByIdRoute({
  schema: z.object({}),
  routeName: 'POST /api/character-cards/revisions/[id]/revert',
  notFoundMessage: 'Revision not found or already reverted',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, id) =>
    revertCharacterRevisionForClerkId(clerkId, id),
})
