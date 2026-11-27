import 'server-only'

import { findLocalNovelAiTag } from '@/lib/novelai-tag-check'
import {
  formatNovelAiTagDisplay,
  toDanbooruUnderscoreTag,
} from '@/lib/tag-recognition'
import {
  findTagMetaBatch,
  findTagsByLocalName,
  findTagsByMeaning,
  localNamesOf,
  type DanbooruTagNameHit,
} from '@/services/research/danbooru-tag-name.service'
import type { NovelAiTagSuggestion } from '@/types/novelai-tags'
import type { DanbooruTagMetaEntry } from '@/types/tag-assist'

/** 覆盖通用 (0)、画师 (1)、作品 (3)、角色 (4)、画面 meta (5)。 */
const BILINGUAL_TAG_CATEGORIES = [0, 1, 3, 4, 5] as const

const DEFAULT_SUGGEST_LIMIT = 12
const SEMANTIC_FETCH_LIMIT = 8

/**
 * 为已有的候选列表批量补齐中日文名与注释。
 * ⚠ 仅在词库真的命中且非空时附加字段，未命中时保持原对象键集合不变（不干扰既有契约测试）。
 */
export async function enrichTagSuggestionsWithLocalNames(
  suggestions: readonly NovelAiTagSuggestion[],
): Promise<NovelAiTagSuggestion[]> {
  if (suggestions.length === 0) return []
  const keys = suggestions.map((item) => toDanbooruUnderscoreTag(item.tag))
  const names = await localNamesOf(keys)
  if (names.size === 0) return [...suggestions]
  return suggestions.map((item, index) => {
    const local = names.get(keys[index]!)
    if (!local) return item
    return {
      ...item,
      ...(local.zh ? { zh: local.zh } : {}),
      ...(local.zhNote ? { zhNote: local.zhNote } : {}),
      ...(local.ja ? { ja: local.ja } : {}),
    }
  })
}

/**
 * 中日文 / 语义混合标签联想：
 * 1. 并行查 `DanbooruTagName` 中日文字面词库（按帖子数降序）与 `workers/semantic-index` 语义向量检索；
 * 2. 字面命中优先、语义补充去重排后；
 * 3. 转成标签台标准写法（画师带 `artist:`，其余用空格）并补全本地释义。
 */
export async function suggestBilingualTags(
  prompt: string,
  limit: number = DEFAULT_SUGGEST_LIMIT,
): Promise<NovelAiTagSuggestion[]> {
  const trimmed = prompt.trim()
  if (!trimmed) return []

  const [localHits, meaningHits] = await Promise.all([
    findTagsByLocalName(trimmed, BILINGUAL_TAG_CATEGORIES, limit),
    findTagsByMeaning(trimmed, BILINGUAL_TAG_CATEGORIES, SEMANTIC_FETCH_LIMIT),
  ])

  const seen = new Set<string>()
  const merged: Array<{
    hit: DanbooruTagNameHit
    source: 'dictionary' | 'semantic'
  }> = []

  for (const hit of localHits) {
    const key = hit.name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    merged.push({ hit, source: 'dictionary' })
  }
  for (const hit of meaningHits) {
    const key = hit.name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    merged.push({ hit, source: 'semantic' })
  }

  const sliced = merged.slice(0, limit)
  if (sliced.length === 0) return []

  const names = await localNamesOf(sliced.map((entry) => entry.hit.name))
  return sliced.map(({ hit, source }) => {
    const local = names.get(hit.name)
    return {
      tag: formatNovelAiTagDisplay(hit.name, hit.category),
      count: hit.post_count,
      category: hit.category,
      source,
      ...(local?.zh ? { zh: local.zh } : {}),
      ...(local?.zhNote ? { zhNote: local.zhNote } : {}),
      ...(local?.ja ? { ja: local.ja } : {}),
    }
  })
}

/** 英文/短语语义兜底：NAI 官方联想无结果时按意思搜通用 / 作品 / 角色标签。 */
export async function suggestSemanticTags(
  prompt: string,
  limit: number = 6,
): Promise<NovelAiTagSuggestion[]> {
  const trimmed = prompt.trim()
  if (!trimmed) return []
  const hits = await findTagsByMeaning(trimmed, [0, 3, 4], limit)
  if (hits.length === 0) return []
  const names = await localNamesOf(hits.map((hit) => hit.name))
  return hits.map((hit) => {
    const local = names.get(hit.name)
    return {
      tag: formatNovelAiTagDisplay(hit.name, hit.category),
      count: hit.post_count,
      category: hit.category,
      source: 'semantic' as const,
      ...(local?.zh ? { zh: local.zh } : {}),
      ...(local?.zhNote ? { zhNote: local.zhNote } : {}),
      ...(local?.ja ? { ja: local.ja } : {}),
    }
  })
}

/**
 * 批量查一批标签的中文/日文释义、注释与词库热度（供原位中文对照与框内认知度提示共用）。
 * 返回以规范化下划线键为索引的字典。
 */
export async function lookupTagMetaBatch(
  rawTags: readonly string[],
): Promise<{ items: Record<string, DanbooruTagMetaEntry> }> {
  const normalizedKeys = [
    ...new Set(
      rawTags
        .map((raw) => toDanbooruUnderscoreTag(raw))
        .filter((key) => key.length > 0),
    ),
  ]
  if (normalizedKeys.length === 0) return { items: {} }

  const rows = await findTagMetaBatch(normalizedKeys)
  const items: Record<string, DanbooruTagMetaEntry> = {}
  for (const key of normalizedKeys) {
    const row = rows.get(key)
    const knownLocally = Boolean(findLocalNovelAiTag(key))
    if (row) {
      items[key] = {
        tag: key,
        zh: row.zh,
        zhNote: row.zhNote,
        ja: row.ja,
        count: row.count,
        category: row.category,
        known: true,
      }
    } else {
      items[key] = {
        tag: key,
        zh: null,
        zhNote: null,
        ja: null,
        count: 0,
        category: null,
        known: knownLocally,
      }
    }
  }
  return { items }
}
