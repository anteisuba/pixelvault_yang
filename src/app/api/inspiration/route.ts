import 'server-only'

import { createApiGetRoute } from '@/lib/api-route-factory'
import { listInspirations } from '@/services/inspiration.service'
import { ListInspirationsQuerySchema } from '@/types'

export const GET = createApiGetRoute({
  schema: ListInspirationsQuerySchema,
  routeName: 'GET /api/inspiration',
  skipAuth: true,
  cacheHeader: 'public, s-maxage=60, stale-while-revalidate=300',
  handler: async ({ data }) =>
    listInspirations({
      category: data.category,
      query: data.query,
      sortBy: data.sortBy,
      limit: data.limit,
      offset: data.offset,
    }),
})
