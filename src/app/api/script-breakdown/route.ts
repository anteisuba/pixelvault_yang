import 'server-only'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiRoute } from '@/lib/api-route-factory'
import { createScriptBreakdown } from '@/services/script-breakdown.service'
import {
  ScriptBreakdownRequestSchema,
  type ScriptBreakdownResponseData,
} from '@/types/script-breakdown'

export const maxDuration = 60

export const POST = createApiRoute<
  typeof ScriptBreakdownRequestSchema,
  ScriptBreakdownResponseData
>({
  schema: ScriptBreakdownRequestSchema,
  rateLimit: RATE_LIMIT_CONFIGS.scriptBreakdown,
  routeName: 'POST /api/script-breakdown',
  handler: async (clerkId, data) => {
    return createScriptBreakdown(clerkId, data)
  },
})
