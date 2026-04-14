import 'server-only'

import { z } from 'zod'

import { getArenaLeaderboard } from '@/services/arena.service'
import { createApiGetRoute } from '@/lib/api-route-factory'

export const GET = createApiGetRoute({
  schema: z.object({}),
  routeName: 'GET /api/arena/leaderboard',
  requireAuth: false,
  handler: async () => getArenaLeaderboard(),
})
