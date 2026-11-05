import 'server-only'

import { PreviewCharacterOutingTopicSchema } from '@/types/character-growth'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { previewOutingTopicForClerkId } from '@/features/cards/server'
import { createApiPostByIdRoute } from '@/lib/api-route-factory'

/**
 * 分类只调一次很小的模型，平时回得很快；时限仍给平台默认 300 秒 —— 大模型慢的时候
 * 按这次请求剩下的时间等，赶在平台之前停并说清原因（`lib/request-deadline.ts`）。
 */
export const maxDuration = 300

/** 出门调查弹框写完话题：预览配了哪些站（不开跑、不扣额度）。卡不是你的 → 404。 */
export const POST = createApiPostByIdRoute({
  maxDuration,
  schema: PreviewCharacterOutingTopicSchema,
  routeName: 'POST /api/character-cards/[id]/outing/topic',
  notFoundMessage: 'Character card not found',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, id, data) =>
    previewOutingTopicForClerkId(clerkId, id, data),
})
