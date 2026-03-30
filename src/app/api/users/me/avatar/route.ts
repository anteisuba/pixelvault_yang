import { UploadProfileImageSchema } from '@/types'
import type { UploadProfileImageResponse } from '@/types'
import { createApiRoute } from '@/lib/api-route-factory'
import { ApiRequestError } from '@/lib/errors'
import { ensureUser, uploadAvatar } from '@/services/user.service'

function mapAvatarUploadError(error: unknown): ApiRequestError {
  const message =
    error instanceof Error ? error.message : 'Failed to upload avatar'

  if (message.includes('Unsupported image type')) {
    return new ApiRequestError(
      'UNSUPPORTED_IMAGE_TYPE',
      400,
      'errors.profile.unsupportedImageType',
      message,
    )
  }

  if (message.includes('under 5 MB')) {
    return new ApiRequestError(
      'AVATAR_TOO_LARGE',
      400,
      'errors.profile.avatarTooLarge',
      message,
    )
  }

  return new ApiRequestError(
    'AVATAR_UPLOAD_FAILED',
    500,
    'errors.profile.avatarUploadFailed',
    'Failed to upload avatar',
  )
}

export const POST = createApiRoute<
  typeof UploadProfileImageSchema,
  NonNullable<UploadProfileImageResponse['data']>
>({
  schema: UploadProfileImageSchema,
  routeName: 'POST /api/users/me/avatar',
  handler: async (clerkId, data) => {
    try {
      const user = await ensureUser(clerkId)
      return await uploadAvatar(user.id, data.imageData)
    } catch (error) {
      throw mapAvatarUploadError(error)
    }
  },
})
