import 'server-only'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { CONTEXT_CARD_LIMITS } from '@/constants/context-cards'
import { createApiPatchByIdRoute } from '@/lib/api-route-factory'
import { ApiRequestError } from '@/lib/errors'
import {
  ContextCardImageLimitError,
  addContextCardImage,
  removeContextCardImage,
} from '@/services/context-cards-avatar.service'
import { ensureUser } from '@/services/user.service'
import {
  AddContextCardImageSchema,
  RemoveContextCardImageSchema,
} from '@/types/context-cards'

/**
 * 一张卡的参考图（第三期 K1）。
 *
 * ⚠ 两条都走**带 id 的工厂**（`createApiPatchByIdRoute`，方法由导出名决定）：
 * 摘图要的是「卡 id + 那条 URL」，而按 id 的删除工厂收不了 body。
 * ⚠ 错误映射逐字复用 persona 头像那条路由的三档，i18n 键也复用 `errors.profile.*`
 * —— 对用户来说「格式不对 / 太大了 / 传失败了」就是同一件事的同一种失败。
 */

function mapImageUploadError(error: unknown): ApiRequestError {
  if (error instanceof ContextCardImageLimitError) {
    return new ApiRequestError(
      'CONTEXT_CARD_IMAGE_LIMIT_REACHED',
      409,
      'errors.contextCard.imageLimitReached',
      `Reference image limit reached (${CONTEXT_CARD_LIMITS.maxImages})`,
    )
  }

  const message =
    error instanceof Error ? error.message : 'Failed to upload image'

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
      'CONTEXT_CARD_IMAGE_TOO_LARGE',
      400,
      'errors.contextCard.imageTooLarge',
      message,
    )
  }

  return new ApiRequestError(
    'CONTEXT_CARD_IMAGE_UPLOAD_FAILED',
    500,
    'errors.profile.avatarUploadFailed',
    'Failed to upload image',
  )
}

export const POST = createApiPatchByIdRoute({
  schema: AddContextCardImageSchema,
  routeName: 'POST /api/context-cards/[id]/images',
  notFoundMessage: 'Context card not found',
  rateLimit: RATE_LIMIT_CONFIGS.sensitiveWrite,
  handler: async (clerkId, id, data) => {
    const user = await ensureUser(clerkId)
    try {
      return await addContextCardImage(user.id, id, {
        imageData: data.imageData,
        role: data.role,
        sourceRef: data.sourceRef ?? null,
      })
    } catch (error) {
      throw mapImageUploadError(error)
    }
  },
})

/**
 * 摘一张参考图。
 * ⚠ 按 **URL** 摘，⛔ 不按下标：下标在两次请求之间会变（另一个标签页刚删了一张），
 * 而按下标摘的表现是「删了不该删的那张」。
 */
export const DELETE = createApiPatchByIdRoute({
  schema: RemoveContextCardImageSchema,
  routeName: 'DELETE /api/context-cards/[id]/images',
  notFoundMessage: 'Context card image not found',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, id, data) => {
    const user = await ensureUser(clerkId)
    return removeContextCardImage(user.id, id, data.url)
  },
})
