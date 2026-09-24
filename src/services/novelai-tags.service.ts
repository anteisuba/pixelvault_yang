import 'server-only'

import { ASSISTANT_NAI_TAG_CHECK } from '@/constants/assistant-operator'
import { AI_PROVIDER_ENDPOINTS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  applyNovelAiTagFixes,
  findLocalNovelAiTag,
  listCheckableNovelAiTags,
  matchNovelAiTagStyle,
  normalizeNovelAiTag,
  pickClosestNovelAiTag,
  type NovelAiTagFix,
} from '@/lib/novelai-tag-check'
import { logger } from '@/lib/logger'
import { findActiveKeyForAdapter } from '@/services/apiKey.service'
import { ensureUser } from '@/services/user.service'
import {
  NovelAiTagModelSchema,
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

async function fetchNovelAiTagSuggestions(
  keyValue: string,
  query: NovelAiTagQuery,
) {
  const url = new URL(
    '/ai/generate-image/suggest-tags',
    AI_PROVIDER_ENDPOINTS.NOVELAI,
  )
  url.search = new URLSearchParams(query).toString()
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${keyValue}` },
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

export async function suggestNovelAiTags(
  clerkId: string,
  query: NovelAiTagQuery,
) {
  const user = await ensureUser(clerkId)
  const key = await findActiveKeyForAdapter(user.id, AI_ADAPTER_TYPES.NOVELAI)
  if (!key) throw new NovelAiTagsError('MISSING_API_KEY', 400)
  return fetchNovelAiTagSuggestions(key.keyValue, query)
}

export interface NovelAiTagCheckResult {
  prompt: string
  /** 换了写法的那几个（原文 → 真实标签）。 */
  fixes: NovelAiTagFix[]
  /** 联想里也找不到接近的，原样保留。 */
  unknown: string[]
}

/**
 * **写入前的标签核对**（拆分与反推 B3，owner 09-24）：本地 Danbooru 词表先查，
 * 查不到的再问 NAI 官方联想；写错的换成最接近的真实标签，查不到的原样保留。
 * ⚠ 没有 NAI key、联想报错或超时的那几个**不下结论**（既不换也不算查不到）——
 * 查不了不等于写错了。
 */
export async function checkNovelAiPromptTags(input: {
  userId: string
  modelId: string
  prompt: string
}): Promise<NovelAiTagCheckResult> {
  const fixes: NovelAiTagFix[] = []
  const unknown: string[] = []
  const remote: string[] = []
  for (const tag of listCheckableNovelAiTags(input.prompt)) {
    const local = findLocalNovelAiTag(tag)
    if (!local) remote.push(tag)
    else if (normalizeNovelAiTag(local) !== normalizeNovelAiTag(tag))
      fixes.push({ from: tag, to: matchNovelAiTagStyle(tag, local) })
  }

  const model = NovelAiTagModelSchema.safeParse(input.modelId)
  const key =
    remote.length > 0 && model.success
      ? await findActiveKeyForAdapter(
          input.userId,
          AI_ADAPTER_TYPES.NOVELAI,
        ).catch(() => null)
      : null
  if (key && model.success) {
    const queue = remote.slice(0, ASSISTANT_NAI_TAG_CHECK.maxLookups)
    const lookup = async (tag: string) => {
      try {
        const { tags } = await fetchNovelAiTagSuggestions(key.keyValue, {
          model: model.data,
          prompt: normalizeNovelAiTag(tag).slice(0, 200),
          lang: 'en',
        })
        const closest = pickClosestNovelAiTag(
          tag,
          tags.map((item) => item.tag),
        )
        if (!closest) unknown.push(tag)
        else if (closest !== tag)
          fixes.push({ from: tag, to: matchNovelAiTagStyle(tag, closest) })
      } catch (error) {
        logger.warn('novelai tag check lookup failed', {
          errorName: error instanceof Error ? error.name : 'UnknownError',
        })
      }
    }
    for (
      let start = 0;
      start < queue.length;
      start += ASSISTANT_NAI_TAG_CHECK.lookupConcurrency
    )
      await Promise.all(
        queue
          .slice(start, start + ASSISTANT_NAI_TAG_CHECK.lookupConcurrency)
          .map(lookup),
      )
  }

  const order = listCheckableNovelAiTags(input.prompt)
  const byOrder = (a: string, b: string) => order.indexOf(a) - order.indexOf(b)
  fixes.sort((a, b) => byOrder(a.from, b.from))
  unknown.sort(byOrder)
  return {
    prompt: applyNovelAiTagFixes(input.prompt, fixes),
    fixes,
    unknown,
  }
}
