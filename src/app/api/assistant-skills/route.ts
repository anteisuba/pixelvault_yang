import 'server-only'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiGetRoute, createApiRoute } from '@/lib/api-route-factory'
import { z } from 'zod'
import {
  createAssistantSkillForClerkId,
  listAssistantSkillsForClerkId,
} from '@/services/assistant-skill.service'
import { CreateAssistantSkillSchema } from '@/types/assistant-skill'
import { assistantSkillErrors } from './errors'

/**
 * 「你的技能」（助手第 7b 步）：读整套（内置 + 你改过的 + 你自己写的），新建一份你自己的。
 * 只读写本人的（服务端按 userId 收敛）。
 */

export const GET = createApiGetRoute({
  schema: z.object({}),
  routeName: 'GET /api/assistant-skills',
  requireAuth: true,
  rateLimit: RATE_LIMIT_CONFIGS.authedRead,
  handler: async ({ clerkId }) => listAssistantSkillsForClerkId(clerkId!),
})

export const POST = createApiRoute({
  schema: CreateAssistantSkillSchema,
  routeName: 'POST /api/assistant-skills',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, data) =>
    assistantSkillErrors(() => createAssistantSkillForClerkId(clerkId, data)),
})
