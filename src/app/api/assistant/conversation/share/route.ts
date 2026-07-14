import { z } from 'zod'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiRoute } from '@/lib/api-route-factory'
import { ApiRequestError } from '@/lib/errors'
import { createAssistantConversationShare } from '@/services/assistant-conversation.service'

const ShareRequestSchema = z.object({
  conversationId: z.string().uuid(),
})

export const POST = createApiRoute({
  schema: ShareRequestSchema,
  routeName: 'POST /api/assistant/conversation/share',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, data) => {
    try {
      return await createAssistantConversationShare(
        clerkId,
        data.conversationId,
      )
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'ASSISTANT_CONVERSATION_NOT_FOUND'
      ) {
        throw new ApiRequestError(
          'ASSISTANT_CONVERSATION_NOT_FOUND',
          404,
          'errors.assistantConversation.notFound',
          'Conversation not found',
        )
      }
      throw error
    }
  },
})
