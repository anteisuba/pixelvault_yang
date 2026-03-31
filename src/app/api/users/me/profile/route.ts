import { z } from 'zod'

import {
  createApiGetRoute,
  createApiRoute,
} from '@/lib/api-route-factory'
import { ApiRequestError } from '@/lib/errors'
import { UpdateProfileSchema } from '@/types'
import type { UpdateProfileResponse } from '@/types'
import { ensureUser, updateProfile } from '@/services/user.service'

const EmptyQuerySchema = z.object({})

function mapProfileError(error: unknown): ApiRequestError {
  const message =
    error instanceof Error ? error.message : 'Failed to update profile'

  if (message.includes('already taken')) {
    return new ApiRequestError(
      'USERNAME_TAKEN',
      409,
      'errors.profile.usernameTaken',
      message,
    )
  }

  if (message.includes('reserved')) {
    return new ApiRequestError(
      'USERNAME_RESERVED',
      409,
      'errors.profile.usernameReserved',
      message,
    )
  }

  if (message.includes('must be')) {
    return new ApiRequestError(
      'INVALID_USERNAME',
      400,
      'errors.profile.usernameInvalid',
      message,
    )
  }

  return new ApiRequestError(
    'PROFILE_UPDATE_FAILED',
    500,
    'errors.profile.updateFailed',
    'Failed to update profile',
  )
}

export const GET = createApiGetRoute<typeof EmptyQuerySchema, NonNullable<UpdateProfileResponse['data']>>({
  schema: EmptyQuerySchema,
  routeName: 'GET /api/users/me/profile',
  requireAuth: true,
  handler: async ({ clerkId }) => {
    if (!clerkId) {
      throw new ApiRequestError(
        'UNAUTHORIZED',
        401,
        'errors.auth.unauthorized',
        'Unauthorized',
      )
    }

    try {
      const user = await ensureUser(clerkId)

      return {
        username: user.username ?? '',
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        bio: user.bio,
        isPublic: user.isPublic,
      }
    } catch {
      throw new ApiRequestError(
        'PROFILE_LOAD_FAILED',
        500,
        'errors.profile.loadFailed',
        'Failed to load profile',
      )
    }
  },
})

export const PUT = createApiRoute<typeof UpdateProfileSchema, NonNullable<UpdateProfileResponse['data']>>({
  schema: UpdateProfileSchema,
  routeName: 'PUT /api/users/me/profile',
  handler: async (clerkId, data) => {
    try {
      const user = await ensureUser(clerkId)
      const updated = await updateProfile(user.id, data)

      return {
        username: updated.username ?? '',
        displayName: updated.displayName,
        avatarUrl: user.avatarUrl,
        bio: updated.bio,
        isPublic: updated.isPublic,
      }
    } catch (error) {
      throw mapProfileError(error)
    }
  },
})
