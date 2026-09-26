import 'server-only'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiRoute } from '@/lib/api-route-factory'
import { ApiRequestError } from '@/lib/errors'
import { uploadAssistantAvatar } from '@/services/assistant-persona-avatar.service'
import { ensureUser } from '@/services/user.service'
import { UploadAssistantAvatarSchema } from '@/types/assistant-persona'

/**
 * 自定义 AI 头像（§8.3）—— 与账户头像那条路**并行**，不是同一条。
 *
 * ⚠ 错误映射逐字复用账户头像那条路由的三档（不支持的格式 / 超 5 MB / 其它），
 * i18n 键也复用 `errors.profile.*`：对用户来说这就是同一件事的同一种失败。
 */

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

export const POST = createApiRoute({
  schema: UploadAssistantAvatarSchema,
  routeName: 'POST /api/assistant/persona/avatar',
  rateLimit: RATE_LIMIT_CONFIGS.sensitiveWrite,
  handler: async (clerkId, data) => {
    try {
      const user = await ensureUser(clerkId)
      return await uploadAssistantAvatar(user.id, data.imageData)
    } catch (error) {
      throw mapAvatarUploadError(error)
    }
  },
})
