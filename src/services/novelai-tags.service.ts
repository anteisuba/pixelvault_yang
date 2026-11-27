import 'server-only'

import { ASSISTANT_NAI_TAG_CHECK } from '@/constants/assistant-operator'
import { AI_PROVIDER_ENDPOINTS } from '@/constants/config'
import { AI_MODELS } from '@/constants/models/enum'
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
import { hasCjkOrNonAscii } from '@/lib/tag-recognition'
import { findActiveKeyForAdapter } from '@/services/apiKey.service'
import {
  enrichTagSuggestionsWithLocalNames,
  suggestBilingualTags,
  suggestSemanticTags,
} from '@/services/tag-assist.service'
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
  // Medium Effort 与 V5 Full 共用词表；官方联想接口认的是基底模型名。
  const upstreamModel =
    query.model === AI_MODELS.NOVELAI_V5_FULL_MEDIUM
      ? AI_MODELS.NOVELAI_V5_FULL
      : query.model
  url.search = new URLSearchParams({
    ...query,
    model: upstreamModel,
  }).toString()
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
  // 中文 / 日文等非 ASCII 查询直接走本地双语词库 + 语义向量检索，不浪费上游英文联想请求，也不强依赖 NAI key。
  if (hasCjkOrNonAscii(query.prompt)) {
    const tags = await suggestBilingualTags(query.prompt)
    return { tags }
  }
  const key = await findActiveKeyForAdapter(user.id, AI_ADAPTER_TYPES.NOVELAI)
  if (!key) throw new NovelAiTagsError('MISSING_API_KEY', 400)
  const official = await fetchNovelAiTagSuggestions(key.keyValue, query)
  if (official.tags.length > 0) {
    return { tags: await enrichTagSuggestionsWithLocalNames(official.tags) }
  }
  // 英文自然语言短语（官方前缀联想无命中时）用语义检索兜底。
  if (query.prompt.includes(' ') || query.prompt.length >= 4) {
    const semantic = await suggestSemanticTags(query.prompt)
    if (semantic.length > 0) return { tags: semantic }
  }
  return official
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
