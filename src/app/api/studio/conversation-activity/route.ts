import 'server-only'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiGetRoute } from '@/lib/api-route-factory'
import { listStudioConversationActivity } from '@/services/studio-conversation-activity.service'
import { StudioConversationActivityQuerySchema } from '@/types/studio-conversation-activity'

/** 左边列表那几段对话的封面 / 进度圈 / 小点（第 9f 步 9f-3）。 */
export const GET = createApiGetRoute({
  schema: StudioConversationActivityQuerySchema,
  routeName: 'GET /api/studio/conversation-activity',
  requireAuth: true,
  rateLimit: RATE_LIMIT_CONFIGS.authedRead,
  handler: async ({ clerkId, data }) =>
    listStudioConversationActivity(clerkId!, data.ids),
})
