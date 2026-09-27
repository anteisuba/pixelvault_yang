import { API_ENDPOINTS } from '@/constants/config'
import {
  DanbooruCatalogSchema,
  type DanbooruCatalogQuery,
} from '@/types/danbooru-catalog'

export async function getDanbooruCatalogAPI(
  query: DanbooruCatalogQuery,
  signal: AbortSignal,
) {
  const params = new URLSearchParams({ kind: query.kind })
  if (query.query) params.set('query', query.query)
  if (query.tag) params.set('tag', query.tag)
  if (query.random) params.set('random', query.random)
  const response = await fetch(`${API_ENDPOINTS.DANBOORU_CATALOG}?${params}`, {
    signal,
  })
  if (!response.ok) throw new Error('UPSTREAM_ERROR')
  const body = await response.json()
  if (!body.success) throw new Error('UPSTREAM_ERROR')
  return DanbooruCatalogSchema.parse(body.data)
}
