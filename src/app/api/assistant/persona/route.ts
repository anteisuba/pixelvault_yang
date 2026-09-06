import 'server-only'

import { z } from 'zod'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiGetRoute, createApiRoute } from '@/lib/api-route-factory'
import {
  getAssistantPersona,
  upsertAssistantPersona,
} from '@/services/assistant-persona.service'
import { UpdateAssistantPersonaSchema } from '@/types/assistant-persona'

/**
 * 助手人设（`docs/references/pages/assistant-shell.md` §8）。
 *
 * ⚠ GET 从来不会 404：库里没有那一行时服务返回 `ASSISTANT_PERSONA_DEFAULTS`
 * （§8.4 第 4 条：不做首次访问自动建行）。
 * ⚠ 头像那两列**不走这条路** —— 见 `avatar/route.ts`。
 */

export const GET = createApiGetRoute({
  schema: z.object({}),
  routeName: 'GET /api/assistant/persona',
  requireAuth: true,
  rateLimit: RATE_LIMIT_CONFIGS.authedRead,
  handler: async ({ clerkId }) => getAssistantPersona(clerkId!),
})

export const PUT = createApiRoute({
  schema: UpdateAssistantPersonaSchema,
  routeName: 'PUT /api/assistant/persona',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, data) => upsertAssistantPersona(clerkId, data),
})
