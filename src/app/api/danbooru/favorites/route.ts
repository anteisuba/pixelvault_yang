import 'server-only'

import { z } from 'zod'

import { createApiGetRoute, createApiRoute } from '@/lib/api-route-factory'
import {
  addDanbooruFavorite,
  listDanbooruFavorites,
} from '@/services/research/danbooru-favorite.service'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { CreateDanbooruFavoriteSchema } from '@/types/danbooru-catalog'

// 查资料的收藏：列出 / 收藏一条。

export const GET = createApiGetRoute({
  schema: z.object({}),
  routeName: 'GET /api/danbooru/favorites',
  requireAuth: true,
  cacheHeader: 'private, no-store',
  rateLimit: RATE_LIMIT_CONFIGS.authedRead,
  handler: async ({ clerkId }) => listDanbooruFavorites(clerkId!),
})

export const POST = createApiRoute({
  schema: CreateDanbooruFavoriteSchema,
  routeName: 'POST /api/danbooru/favorites',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, data) => addDanbooruFavorite(clerkId, data),
})
