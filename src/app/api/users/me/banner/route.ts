import { UploadProfileImageSchema } from '@/types'
import type { UploadProfileImageResponse } from '@/types'
import { createApiRoute } from '@/lib/api-route-factory'
import { ApiRequestError } from '@/lib/errors'
import { ensureUser, uploadBanner } from '@/services/user.service'

function mapBannerUploadError(error: unknown): ApiRequestError {
  const message =
    error instanceof Error ? error.message : 'Failed to upload banner'

  if (message.includes('Unsupported image type')) {
    return new ApiRequestError(
      'UNSUPPORTED_IMAGE_TYPE',
      400,
      'errors.profile.unsupportedImageType',
      message,
    )
  }

  if (message.includes('under 10 MB')) {
    return new ApiRequestError(
      'BANNER_TOO_LARGE',
      400,
      'errors.profile.bannerTooLarge',
      message,
    )
  }

  return new ApiRequestError(
    'BANNER_UPLOAD_FAILED',
    500,
    'errors.profile.bannerUploadFailed',
    'Failed to upload banner',
  )
}

export const POST = createApiRoute<
  typeof UploadProfileImageSchema,
  NonNullable<UploadProfileImageResponse['data']>
>({
  schema: UploadProfileImageSchema,
  routeName: 'POST /api/users/me/banner',
  handler: async (clerkId, data) => {
    try {
      const user = await ensureUser(clerkId)
      return await uploadBanner(user.id, data.imageData)
    } catch (error) {
      throw mapBannerUploadError(error)
    }
  },
})
