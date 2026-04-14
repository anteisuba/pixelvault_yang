import 'server-only'

import { ArenaVoteRequestSchema } from '@/types'
import { submitArenaVote } from '@/services/arena.service'
import { ApiRequestError } from '@/lib/errors'
import { createApiPostByIdRoute } from '@/lib/api-route-factory'

export const POST = createApiPostByIdRoute({
  schema: ArenaVoteRequestSchema,
  routeName: 'POST /api/arena/matches/[id]/vote',
  handler: async (clerkId, id, data) => {
    try {
      return await submitArenaVote(id, data.winnerEntryId, clerkId)
    } catch (error) {
      if (error instanceof Error && error.message === 'Match already voted') {
        throw new ApiRequestError(
          'ALREADY_VOTED',
          409,
          'errors.arena.alreadyVoted',
          error.message,
        )
      }
      throw error
    }
  },
})
