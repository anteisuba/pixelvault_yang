import { API_ENDPOINTS } from '@/constants/config'
import {
  NovelAiTagResponseSchema,
  type NovelAiTagQuery,
} from '@/types/novelai-tags'

export async function getNovelAiTagSuggestionsAPI(
  query: NovelAiTagQuery,
  signal: AbortSignal,
) {
  const response = await fetch(
    `${API_ENDPOINTS.NOVELAI_TAG_SUGGESTIONS}?${new URLSearchParams(query)}`,
    { signal },
  )
  const body = await response.json()
  if (!response.ok || !body.success) {
    throw new Error(
      body.errorCode === 'MISSING_API_KEY'
        ? 'MISSING_API_KEY'
        : 'UPSTREAM_ERROR',
    )
  }
  return NovelAiTagResponseSchema.parse(body.data)
}
