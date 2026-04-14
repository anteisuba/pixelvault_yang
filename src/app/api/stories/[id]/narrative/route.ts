import 'server-only'

import { GenerateNarrativeRequestSchema } from '@/types'
import { generateNarrative } from '@/services/story.service'
import { createApiPostByIdRoute } from '@/lib/api-route-factory'

export const maxDuration = 30

export const POST = createApiPostByIdRoute({
  schema: GenerateNarrativeRequestSchema,
  routeName: 'POST /api/stories/[id]/narrative',
  rateLimit: { limit: 5, windowSeconds: 60 },
  handler: async (clerkId, id, data) => {
    const panels = await generateNarrative(id, clerkId, data.tone)
    return { panels }
  },
})
