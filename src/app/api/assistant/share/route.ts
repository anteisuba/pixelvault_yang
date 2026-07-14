import { z } from 'zod'

import { createApiGetRoute } from '@/lib/api-route-factory'
import { ApiRequestError } from '@/lib/errors'
import { getSharedAssistantConversation } from '@/services/assistant-conversation.service'

const ShareTokenSchema = z.object({
  token: z.string().trim().min(32).max(200),
})

export const GET = createApiGetRoute({
  schema: ShareTokenSchema,
  routeName: 'GET /api/assistant/share',
  skipAuth: true,
  cacheHeader: 'private, no-store',
  handler: async ({ data }) => {
    const conversation = await getSharedAssistantConversation(data.token)
    if (!conversation) {
      throw new ApiRequestError(
        'ASSISTANT_SHARE_NOT_FOUND',
        404,
        'errors.assistantConversation.shareNotFound',
        'This assistant share link is no longer available',
      )
    }
    return conversation
  },
})
