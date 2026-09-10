import 'server-only'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import {
  createApiDeleteRoute,
  createApiPatchByIdRoute,
} from '@/lib/api-route-factory'
import {
  deleteAssistantConversation,
  renameAssistantConversation,
} from '@/services/assistant-conversation.service'

export const DELETE = createApiDeleteRoute({
  routeName: 'DELETE /api/assistant/conversation/[id]',
  notFoundMessage: 'Conversation not found',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: deleteAssistantConversation,
})

import { RenameAssistantConversationRequestSchema } from '@/types/assistant-conversation'

export const PATCH = createApiPatchByIdRoute({
  schema: RenameAssistantConversationRequestSchema,
  routeName: 'PATCH /api/assistant/conversation/[id]',
  notFoundMessage: 'Conversation not found',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: renameAssistantConversation,
})
