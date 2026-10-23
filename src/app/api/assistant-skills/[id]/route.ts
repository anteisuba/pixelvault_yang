import 'server-only'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import {
  createApiDeleteRoute,
  createApiPatchByIdRoute,
} from '@/lib/api-route-factory'
import {
  deleteAssistantSkillForClerkId,
  updateAssistantSkillForClerkId,
} from '@/services/assistant-skill.service'
import { UpdateAssistantSkillSchema } from '@/types/assistant-skill'
import { assistantSkillErrors } from '../errors'

/**
 * 一份技能（你自己写的，或你那份内置改版）：改、开关、删。删内置改版 = 回到内置原样。
 * ⚠ ownership 在服务端：不是你的回 null，工厂出 404。
 */

export const PATCH = createApiPatchByIdRoute({
  schema: UpdateAssistantSkillSchema,
  routeName: 'PATCH /api/assistant-skills/[id]',
  notFoundMessage: 'Assistant skill not found',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, id, data) =>
    assistantSkillErrors(() =>
      updateAssistantSkillForClerkId(clerkId, id, data),
    ),
})

export const DELETE = createApiDeleteRoute({
  routeName: 'DELETE /api/assistant-skills/[id]',
  notFoundMessage: 'Assistant skill not found',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, id) => deleteAssistantSkillForClerkId(clerkId, id),
})
