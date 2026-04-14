import 'server-only'

import { z } from 'zod'

import { getPersonalArenaStats } from '@/services/arena.service'
import { createApiGetRoute } from '@/lib/api-route-factory'

export const GET = createApiGetRoute({
  schema: z.object({}),
  routeName: 'GET /api/arena/personal-stats',
  requireAuth: true,
  handler: async ({ clerkId }) => getPersonalArenaStats(clerkId!),
})
