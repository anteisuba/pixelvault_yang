import 'server-only'

import { ScoreConsistencySchema } from '@/types'
import { scoreGenerationForCard } from '@/services/character-scoring.service'
import { createApiPostByIdRoute } from '@/lib/api-route-factory'

export const POST = createApiPostByIdRoute({
  schema: ScoreConsistencySchema,
  routeName: 'POST /api/character-cards/[id]/score',
  handler: async (clerkId, id, data) =>
    scoreGenerationForCard(clerkId, id, data.generationId),
})
