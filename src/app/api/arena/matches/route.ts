import 'server-only'

import { CreateArenaMatchRequestSchema } from '@/types'
import { createArenaMatch } from '@/services/arena.service'
import { createApiRoute } from '@/lib/api-route-factory'

export const maxDuration = 240

export const POST = createApiRoute({
  schema: CreateArenaMatchRequestSchema,
  routeName: 'POST /api/arena/matches',
  rateLimit: { limit: 5, windowSeconds: 60 },
  handler: async (clerkId, data) => {
    const matchId = await createArenaMatch(clerkId, {
      prompt: data.prompt,
      aspectRatio: data.aspectRatio,
      referenceImage: data.referenceImage,
    })
    return { matchId }
  },
})
