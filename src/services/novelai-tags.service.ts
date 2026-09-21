import 'server-only'

import { AI_PROVIDER_ENDPOINTS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { findActiveKeyForAdapter } from '@/services/apiKey.service'
import { ensureUser } from '@/services/user.service'
import {
  NovelAiTagResponseSchema,
  type NovelAiTagQuery,
} from '@/types/novelai-tags'

export class NovelAiTagsError extends Error {
  constructor(
    public readonly code: 'MISSING_API_KEY' | 'UPSTREAM_ERROR',
    public readonly status: number,
  ) {
    super(code)
  }
}

export async function suggestNovelAiTags(
  clerkId: string,
  query: NovelAiTagQuery,
) {
  const user = await ensureUser(clerkId)
  const key = await findActiveKeyForAdapter(user.id, AI_ADAPTER_TYPES.NOVELAI)
  if (!key) throw new NovelAiTagsError('MISSING_API_KEY', 400)
  const url = new URL(
    '/ai/generate-image/suggest-tags',
    AI_PROVIDER_ENDPOINTS.NOVELAI,
  )
  url.search = new URLSearchParams(query).toString()
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${key.keyValue}` },
    signal: AbortSignal.timeout(8000),
    cache: 'no-store',
    redirect: 'error',
  })
  if (!response.ok)
    throw new NovelAiTagsError(
      'UPSTREAM_ERROR',
      response.status === 429 ? 429 : 502,
    )
  return NovelAiTagResponseSchema.parse(await response.json())
}
