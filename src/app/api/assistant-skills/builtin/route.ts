import 'server-only'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiRoute } from '@/lib/api-route-factory'
import { updateBuiltinSkillForClerkId } from '@/services/assistant-skill.service'
import { UpdateBuiltinSkillSchema } from '@/types/assistant-skill'
import { assistantSkillErrors } from '../errors'

/** 内置那一份：开 / 关，或「改成我的版本」（给 body）。只动本人那一行。 */
export const POST = createApiRoute({
  schema: UpdateBuiltinSkillSchema,
  routeName: 'POST /api/assistant-skills/builtin',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, data) =>
    assistantSkillErrors(() => updateBuiltinSkillForClerkId(clerkId, data)),
})
