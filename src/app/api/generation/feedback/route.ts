import 'server-only'

import { GenerationFeedbackRequestSchema } from '@/types'
import { conversationalRefine } from '@/services/generation-feedback.service'
import { createApiRoute } from '@/lib/api-route-factory'

export const maxDuration = 300

export const POST = createApiRoute({
  maxDuration,
  schema: GenerationFeedbackRequestSchema,
  routeName: 'POST /api/generation/feedback',
  rateLimit: { limit: 20, windowSeconds: 60 },
  handler: async (clerkId, data) =>
    conversationalRefine(
      clerkId,
      data.imageUrl,
      data.originalPrompt,
      data.messages,
      data.locale,
      data.apiKeyId,
    ),
})
