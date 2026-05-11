import 'server-only'

import { z } from 'zod'

import { getArenaLeaderboard } from '@/services/arena.service'
import { createApiGetRoute } from '@/lib/api-route-factory'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'

export const GET = createApiGetRoute({
  schema: z.object({}),
  routeName: 'GET /api/arena/leaderboard',
  requireAuth: false,
  rateLimit: RATE_LIMIT_CONFIGS.authedRead,
  handler: async () => getArenaLeaderboard(),
})
