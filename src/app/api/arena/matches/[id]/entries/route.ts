import 'server-only'

import { CreateArenaEntryRequestSchema } from '@/types'
import { generateArenaEntry } from '@/services/arena.service'
import { createApiPostByIdRoute } from '@/lib/api-route-factory'

export const maxDuration = 240

export const POST = createApiPostByIdRoute({
  schema: CreateArenaEntryRequestSchema,
  routeName: 'POST /api/arena/matches/[id]/entries',
  rateLimit: { limit: 20, windowSeconds: 60 },
  handler: async (clerkId, id, data) =>
    generateArenaEntry(id, clerkId, {
      modelId: data.modelId,
      apiKeyId: data.apiKeyId,
      slotIndex: data.slotIndex,
      advancedParams: data.advancedParams,
    }),
})
