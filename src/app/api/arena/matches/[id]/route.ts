import 'server-only'

import { getArenaMatch } from '@/services/arena.service'
import { createApiGetByIdRoute } from '@/lib/api-route-factory'

export const GET = createApiGetByIdRoute({
  routeName: 'GET /api/arena/matches/[id]',
  notFoundMessage: 'Match not found',
  handler: async (clerkId, id) => getArenaMatch(id, clerkId),
})
