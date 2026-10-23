import 'server-only'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiRoute } from '@/lib/api-route-factory'
import { lookupMentionAssetsForClerkId } from '@/services/assistant-mention.service'
import { AssistantMentionLookupSchema } from '@/types/assistant-mention'

/**
 * 按地址查这几张在库里叫什么 —— 参考位在 `@` 菜单与胶囊上带真名（§10b），⛔ 不再
 * 只写「图1」。只认本人的；查不到的不回。
 */
export const POST = createApiRoute({
  schema: AssistantMentionLookupSchema,
  routeName: 'POST /api/assistant/mentions/lookup',
  rateLimit: RATE_LIMIT_CONFIGS.authedRead,
  handler: async (clerkId, data) =>
    lookupMentionAssetsForClerkId(clerkId, data),
})
