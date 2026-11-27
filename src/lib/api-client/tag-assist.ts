import { API_ENDPOINTS } from '@/constants/config'
import { apiFetch } from '@/lib/api-client/api-fetch'
import {
  DanbooruCooccurrenceResponseSchema,
  DanbooruTagMetaResponseSchema,
  DanbooruTagSuggestResponseSchema,
  type DanbooruCooccurrenceResponse,
  type DanbooruTagMetaResponse,
  type DanbooruTagSuggestResponse,
} from '@/types/tag-assist'

export async function getDanbooruTagSuggestionsAPI(
  q: string,
  signal: AbortSignal,
): Promise<DanbooruTagSuggestResponse> {
  const response = await apiFetch(
    `${API_ENDPOINTS.DANBOORU_TAG_SUGGESTIONS}?${new URLSearchParams({ q })}`,
    { signal },
  )
  const body = await response.json()
  if (!response.ok || !body.success) {
    throw new Error(body.error ?? 'Failed to fetch tag suggestions')
  }
  return DanbooruTagSuggestResponseSchema.parse(body.data)
}

export async function lookupTagMetaBatchAPI(
  tags: readonly string[],
  signal?: AbortSignal,
): Promise<DanbooruTagMetaResponse> {
  const response = await apiFetch(API_ENDPOINTS.DANBOORU_TAG_META, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tags }),
    signal,
  })
  const body = await response.json()
  if (!response.ok || !body.success) {
    throw new Error(body.error ?? 'Failed to lookup tag metadata')
  }
  return DanbooruTagMetaResponseSchema.parse(body.data)
}

export async function getDanbooruCooccurrenceAPI(
  tags: readonly string[],
  signal?: AbortSignal,
): Promise<DanbooruCooccurrenceResponse> {
  const response = await apiFetch(
    `${API_ENDPOINTS.DANBOORU_COOCCURRENCE}?${new URLSearchParams({ tags: tags.join(',') })}`,
    { signal },
  )
  const body = await response.json()
  if (!response.ok || !body.success) {
    throw new Error(body.error ?? 'Failed to fetch co-occurring tags')
  }
  return DanbooruCooccurrenceResponseSchema.parse(body.data)
}
