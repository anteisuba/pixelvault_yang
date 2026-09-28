import 'server-only'

import { createApiDeleteRoute } from '@/lib/api-route-factory'
import { removeDanbooruFavorite } from '@/services/research/danbooru-favorite.service'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'

// 取消收藏一条。不是自己的 / 已经删了 = 404。

export const DELETE = createApiDeleteRoute({
  routeName: 'DELETE /api/danbooru/favorites/[id]',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, id) => removeDanbooruFavorite(clerkId, id),
})
