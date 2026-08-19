import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiRoute } from '@/lib/api-route-factory'
import {
  persistEditedImage,
  replaceObjects,
  resolveEditApiKey,
} from '@/services/image/image-edit.service'
import { ensureUser } from '@/services/user.service'
import { ObjectReplaceRequestSchema } from '@/types'

/**
 * 多框编号 + 注释清单一次全改（E3）。
 *
 * ⚠ 收的是**注释清单**不是 mask —— 图上那些 ①②③ 只存在于 UI 和编译出来的
 * prompt 里，喂给模型的始终是干净原图（`docs/references/pages/
 * studio-image-edit.md` §5）。
 */
export const maxDuration = 180

export const POST = createApiRoute({
  schema: ObjectReplaceRequestSchema,
  rateLimit: RATE_LIMIT_CONFIGS.imageEdit,
  routeName: 'POST /api/image/object-replace',
  handler: async (clerkId, data) => {
    const user = await ensureUser(clerkId)
    const apiKey = await resolveEditApiKey(user.id, data.modelId, data.apiKeyId)

    const result = await replaceObjects({
      imageUrl: data.imageUrl,
      annotations: data.annotations,
      apiKey,
      modelId: data.modelId,
    })

    const generation = await persistEditedImage({
      userId: user.id,
      resultUrl: result.imageUrl,
      sourceGenerationId: data.sourceGenerationId,
      action: 'object-replace',
      width: result.width,
      height: result.height,
    })

    return { ...result, generation }
  },
})
