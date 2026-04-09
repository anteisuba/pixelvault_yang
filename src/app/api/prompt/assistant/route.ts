import { PromptAssistantRequestSchema } from '@/types'
import { chatPromptAssistant } from '@/services/prompt-assistant.service'
import { createApiRoute } from '@/lib/api-route-factory'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'

export const maxDuration = 60

export const POST = createApiRoute({
  schema: PromptAssistantRequestSchema,
  rateLimit: RATE_LIMIT_CONFIGS.promptAssistant,
  routeName: 'POST /api/prompt/assistant',
  handler: async (clerkId, data) => {
    return chatPromptAssistant(
      clerkId,
      data.messages,
      data.modelId,
      data.referenceImageData,
      data.currentPrompt,
      data.apiKeyId,
    )
  },
})
