import 'server-only'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiGetRoute } from '@/lib/api-route-factory'
import { suggestBilingualTags } from '@/services/tag-assist.service'
import { DanbooruTagSuggestQuerySchema } from '@/types/tag-assist'

export const GET = createApiGetRoute({
  routeName: 'GET /api/danbooru/tag-suggestions',
  requireAuth: true,
  cacheHeader: 'private, max-age=300',
  rateLimit: RATE_LIMIT_CONFIGS.authedRead,
  schema: DanbooruTagSuggestQuerySchema,
  handler: async ({ data }) => ({
    tags: await suggestBilingualTags(data.q),
  }),
})
