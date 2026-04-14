import 'server-only'

import { PromptFeedbackRequestSchema } from '@/types'
import { getPromptFeedback } from '@/services/prompt-feedback.service'
import { createApiRoute } from '@/lib/api-route-factory'

export const maxDuration = 30

export const POST = createApiRoute({
  schema: PromptFeedbackRequestSchema,
  routeName: 'POST /api/prompt/feedback',
  rateLimit: { limit: 10, windowSeconds: 60 },
  handler: async (clerkId, data) =>
    getPromptFeedback(clerkId, data.prompt, data.context, data.apiKeyId),
})
