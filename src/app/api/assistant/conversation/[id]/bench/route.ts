import 'server-only'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiPatchByIdRoute } from '@/lib/api-route-factory'
import { setAssistantConversationBench } from '@/services/assistant-conversation.service'
import { SetAssistantConversationBenchRequestSchema } from '@/types/assistant-conversation'

/** 记下这段对话最后开着的台（第 9f 步 9f-3「台跟着对话走」）。 */
export const PATCH = createApiPatchByIdRoute({
  schema: SetAssistantConversationBenchRequestSchema,
  routeName: 'PATCH /api/assistant/conversation/[id]/bench',
  notFoundMessage: 'Conversation not found',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: setAssistantConversationBench,
})
