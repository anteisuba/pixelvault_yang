import 'server-only'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiRoute } from '@/lib/api-route-factory'
import { createSeedancePromptPlan } from '@/services/seedance-prompt-plan.service'
import {
  SeedancePromptPlanRequestSchema,
  type SeedancePromptPlanResponseData,
} from '@/types/seedance-prompt-plan'

export const maxDuration = 60

export const POST = createApiRoute<
  typeof SeedancePromptPlanRequestSchema,
  SeedancePromptPlanResponseData
>({
  schema: SeedancePromptPlanRequestSchema,
  rateLimit: RATE_LIMIT_CONFIGS.seedancePromptPlan,
  routeName: 'POST /api/studio/seedance-prompt-plan',
  handler: async (clerkId, data) => {
    return createSeedancePromptPlan(clerkId, data)
  },
})
