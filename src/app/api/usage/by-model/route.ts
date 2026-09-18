import 'server-only'

import { z } from 'zod'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiGetRoute } from '@/lib/api-route-factory'
import { ensureUser } from '@/services/user.service'
import { getUserMonthlyUsageByModel } from '@/services/usage.service'

export const GET = createApiGetRoute({
  schema: z.object({}),
  routeName: 'GET /api/usage/by-model',
  requireAuth: true,
  rateLimit: RATE_LIMIT_CONFIGS.authedRead,
  handler: async ({ clerkId }) => {
    const user = await ensureUser(clerkId!)
    return getUserMonthlyUsageByModel(user.id)
  },
})
