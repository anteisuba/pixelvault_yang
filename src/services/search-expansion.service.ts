import 'server-only'

import { SEARCH_EXPANSION as EXPANSION } from '@/constants/semantic-search'
import { logger } from '@/lib/logger'
import { tagWord } from '@/lib/search-words'
import {
  findTagsByLocalName,
  findTagsByMeaning,
} from '@/services/research/danbooru-tag-name.service'

/**
 * 搜索词 → 几个英文标签写法（`下雨` → `rain`，`猫耳` → `cat ears`，`雨の日` → `rain`）：
 * 中日文词库（字面）在前，按意思（语义检索）在后。原词本身不在里面（字面那边已经搜过了）。
 * 词库、语义检索不可用时各自回空；⛔ 抛错（调用方常常不等它）。
 */
const cache = new Map<string, { at: number; words: Promise<string[]> }>()

async function translate(text: string): Promise<string[]> {
  const [local, meaning] = await Promise.all([
    findTagsByLocalName(text, EXPANSION.CATEGORIES, EXPANSION.LOCAL_LIMIT),
    findTagsByMeaning(text, EXPANSION.CATEGORIES, EXPANSION.MEANING_LIMIT),
  ])
  const query = text.toLowerCase()
  const words = [...local, ...meaning]
    .map((tag) => tagWord(tag.name))
    .filter((word) => word && word.toLowerCase() !== query)
  return [...new Set(words)].slice(0, EXPANSION.MAX_WORDS)
}

export function expandSearchWords(query: string): Promise<string[]> {
  const text = query.trim().slice(0, EXPANSION.MAX_QUERY_CHARS)
  if (!text) return Promise.resolve([])
  const hit = cache.get(text)
  if (hit && Date.now() - hit.at < EXPANSION.CACHE_TTL_MS) return hit.words
  const words = translate(text).catch((error: unknown) => {
    logger.warn('search expansion failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    cache.delete(text)
    return []
  })
  cache.delete(text)
  cache.set(text, { at: Date.now(), words })
  if (cache.size > EXPANSION.CACHE_SIZE) {
    cache.delete(cache.keys().next().value as string)
  }
  return words
}

/**
 * 好几个词（`下雨 猫耳`、`rain, 夜景`）各翻各的再合起来；一个词就是 `expandSearchWords`。
 * 已经出现在搜索词里的写法不要（字面那边搜过了）。
 */
export async function expandSearchQuery(query: string): Promise<string[]> {
  const parts = [
    ...new Set(
      query
        .trim()
        .slice(0, EXPANSION.MAX_QUERY_CHARS)
        .split(/[\s,，、;；]+/)
        .filter(Boolean),
    ),
  ].slice(0, EXPANSION.MAX_PARTS)
  if (parts.length <= 1) return expandSearchWords(parts[0] ?? '')
  const lowered = parts.map((part) => part.toLowerCase())
  const words = (await Promise.all(parts.map(expandSearchWords)))
    .flat()
    .filter((word) => !lowered.includes(word.toLowerCase()))
  return [...new Set(words)].slice(0, EXPANSION.MAX_WORDS * EXPANSION.MAX_PARTS)
}

/** 测试用。 */
export function clearSearchExpansionCache(): void {
  cache.clear()
}
