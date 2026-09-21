import { createApiGetRoute } from '@/lib/api-route-factory'
import { DanbooruCatalogQuerySchema } from '@/types/danbooru-catalog'
import { fetchDanbooruCatalog } from '@/services/research/danbooru.connector'

export const GET = createApiGetRoute({
  routeName: 'danbooru.catalog',
  requireAuth: true,
  cacheHeader: 'private, no-store',
  schema: DanbooruCatalogQuerySchema,
  handler: ({ data }) => fetchDanbooruCatalog(data),
})
