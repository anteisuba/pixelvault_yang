import 'server-only'

import { createApiGetRoute } from '@/lib/api-route-factory'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { SearchExpansionQuerySchema } from '@/types/search-expansion'
import { expandSearchQuery } from '@/services/search-expansion.service'

// 库页面的搜索框：搜索词翻成几个英文标签写法（下雨 → rain），页面拿它在已经载入的列表里再对一遍。

export const GET = createApiGetRoute({
  schema: SearchExpansionQuerySchema,
  routeName: 'GET /api/search/expand',
  requireAuth: true,
  cacheHeader: 'private, max-age=600',
  rateLimit: RATE_LIMIT_CONFIGS.authedRead,
  handler: async ({ data }) => ({ words: await expandSearchQuery(data.q) }),
})
