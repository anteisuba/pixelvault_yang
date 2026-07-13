import 'server-only'

import { z } from 'zod'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiGetRoute, createApiRoute } from '@/lib/api-route-factory'
import { ApiRequestError } from '@/lib/errors'
import {
  getAssistantConversation,
  listAssistantConversations,
  upsertAssistantConversation,
} from '@/services/assistant-conversation.service'
import {
  AssistantSurfaceSchema,
  UpsertAssistantConversationRequestSchema,
} from '@/types/assistant-conversation'

export const GET = createApiGetRoute({
  schema: z.object({
    surface: AssistantSurfaceSchema,
    projectId: z.string().trim().min(1).max(160).optional(),
    id: z.string().uuid().optional(),
    /** When "1", return a list of conversation summaries instead of one body. */
    list: z.enum(['0', '1']).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
  }),
  routeName: 'GET /api/assistant/conversation',
  requireAuth: true,
  rateLimit: RATE_LIMIT_CONFIGS.authedRead,
  handler: async ({ clerkId, data }) => {
    if (data.list === '1') {
      return listAssistantConversations(clerkId!, {
        surface: data.surface,
        projectId: data.projectId,
        limit: data.limit,
      })
    }

    return getAssistantConversation(clerkId!, {
      id: data.id,
      surface: data.surface,
      projectId: data.projectId,
    })
  },
})

export const POST = createApiRoute({
  schema: UpsertAssistantConversationRequestSchema,
  routeName: 'POST /api/assistant/conversation',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, data) => {
    try {
      return await upsertAssistantConversation(clerkId, data)
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
