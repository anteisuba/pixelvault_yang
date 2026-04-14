import 'server-only'

import { ToggleFollowSchema } from '@/types'
import { ensureUser } from '@/services/user.service'
import { toggleFollow } from '@/services/follow.service'
import { ApiRequestError } from '@/lib/errors'
import { createApiRoute } from '@/lib/api-route-factory'

export const POST = createApiRoute({
  schema: ToggleFollowSchema,
  routeName: 'POST /api/follows',
  handler: async (clerkId, data) => {
    const user = await ensureUser(clerkId)
    try {
      return await toggleFollow(user.id, data.targetUserId)
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes('yourself') ||
          error.message.includes('not found'))
      ) {
        throw new ApiRequestError(
          'INVALID_FOLLOW',
          400,
          'errors.follow.invalid',
          error.message,
        )
      }
      throw error
    }
  },
})
