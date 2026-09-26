import 'server-only'

import { z } from 'zod'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiPostByIdRoute } from '@/lib/api-route-factory'
import { sampleCharacterLines } from '@/services/cards/character-sample-lines.service'

export const POST = createApiPostByIdRoute({
  schema: z.object({}),
  routeName: 'POST /api/character-cards/[id]/sample-lines',
  rateLimit: RATE_LIMIT_CONFIGS.promptAssistant,
  handler: async (clerkId, id) => sampleCharacterLines(clerkId, id),
})
