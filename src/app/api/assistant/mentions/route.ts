import 'server-only'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiGetRoute } from '@/lib/api-route-factory'
import { searchMentionLibraryForClerkId } from '@/services/assistant-mention.service'
import { AssistantMentionLibrarySearchSchema } from '@/types/assistant-mention'

/**
 * 助手输入框 `@` 菜单的素材库那一组（设计方案 §10b）：名字 / `#序号` / 文件夹 /
 * 提示词多字段检索，`folderId` 下钻。只读。
 */
export const GET = createApiGetRoute({
  schema: AssistantMentionLibrarySearchSchema,
  routeName: 'GET /api/assistant/mentions',
  requireAuth: true,
  rateLimit: RATE_LIMIT_CONFIGS.authedRead,
  cacheHeader: 'private, max-age=5',
  handler: async ({ clerkId, data }) =>
    searchMentionLibraryForClerkId(clerkId!, {
      q: data.q,
      limit: data.limit,
      ...(data.folderId ? { folderId: data.folderId } : {}),
    }),
})
