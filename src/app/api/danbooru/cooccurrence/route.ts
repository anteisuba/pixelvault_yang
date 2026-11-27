import 'server-only'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiGetRoute } from '@/lib/api-route-factory'
import { fetchDanbooruCooccurrence } from '@/services/research/danbooru.connector'
import { DanbooruCooccurrenceQuerySchema } from '@/types/tag-assist'

export const GET = createApiGetRoute({
  routeName: 'GET /api/danbooru/cooccurrence',
  requireAuth: true,
  cacheHeader: 'private, max-age=300',
  rateLimit: RATE_LIMIT_CONFIGS.authedRead,
  schema: DanbooruCooccurrenceQuerySchema,
  handler: ({ data }) => fetchDanbooruCooccurrence(data.tags),
})
