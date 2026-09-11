import 'server-only'

import { z } from 'zod'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiGetRoute, createApiRoute } from '@/lib/api-route-factory'
import { ApiRequestError } from '@/lib/errors'
import {
  getAssistantConversation,
  listAssistantConversations,
  updateAssistantConversationRound,
  upsertAssistantConversation,
} from '@/services/assistant-conversation.service'
import {
  AssistantSurfaceSchema,
  UpdateAssistantConversationRoundRequestSchema,
  UpsertAssistantConversationRequestSchema,
} from '@/types/assistant-conversation'

export const GET = createApiGetRoute({
  schema: z.object({
    surface: AssistantSurfaceSchema,
    projectId: z.string().trim().min(1).max(160).optional(),
    id: z.string().uuid().optional(),
    /** When "1", return a list of conversation summaries instead of one body. */
    list: z.enum(['0', '1']).optional(),
    operatorOnly: z.enum(['0', '1']).optional(),
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
        operatorOnly: data.operatorOnly === '1',
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

/**
 * **改一条结论记录**（v2 §7.7，commit #13）—— 三栏就地编辑的落点。
 *
 * ⚠ 挂在**这条既有路由**上而不是新开一个：它改的是会话那一行里的一列，
 * 与 POST 改 `messages` 是同一件事的两半（⛔ 不为一列新开一条路由）。
 * ⚠ 所有权与「有没有这一号」都在 service 里核，这里只把 `null` 翻成 404 ——
 * 非法 `roundIndex`（负数 / 非整数）已经被 schema 拦在外面。
 */
export const PATCH = createApiRoute({
  schema: UpdateAssistantConversationRoundRequestSchema,
  routeName: 'PATCH /api/assistant/conversation',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, data) => {
    const updated = await updateAssistantConversationRound(
      clerkId,
      data.id,
      data.roundIndex,
      { facts: data.facts, decisions: data.decisions, todos: data.todos },
    )
    if (!updated) {
      throw new ApiRequestError(
        'ASSISTANT_CONVERSATION_NOT_FOUND',
        404,
        'errors.assistantConversation.notFound',
        'Conversation round not found',
      )
    }
    return updated
  },
})
