import { API_ENDPOINTS } from '@/constants/config'
import { SearchExpansionSchema } from '@/types/search-expansion'

/** 搜索词翻成的英文标签写法（下雨 → rain）；出错回空，库页面照常只按字面筛。 */
export async function expandSearchQueryAPI(
  q: string,
  signal: AbortSignal,
): Promise<string[]> {
  const params = new URLSearchParams({ q })
  const response = await fetch(`${API_ENDPOINTS.SEARCH_EXPAND}?${params}`, {
    signal,
  })
  if (!response.ok) return []
  const body = await response.json()
  if (!body.success) return []
  return SearchExpansionSchema.parse(body.data).words
}
