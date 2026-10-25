import { ASSISTANT_NEXT_FIND_LIMITS as LIMITS } from '@/features/assistant/constants'

/** 查词拆成词：空白、逗号、顿号都算分隔；`_` 与空格看成一样（Danbooru 写法）。 */
export function queryWords(query: string): string[] {
  return [
    ...new Set(
      query
        .toLowerCase()
        .replace(/_/g, ' ')
        .split(/[\s,，、;；]+/)
        .filter(Boolean),
    ),
  ].slice(0, LIMITS.maxQueryWords)
}

/**
 * 按命中排（10-25）：任意一个词命中就算，命中越多越靠前，同分保持原来的先后（最近的在前）。
 * ⚠ 以前要每个词都命中 —— 模型一次写好几个词（中英混写、同义词并列），几乎必然一个都查不到。
 */
export function ranked<T>(
  items: readonly T[],
  query: string,
  fields: (item: T) => readonly (string | null | undefined)[],
): T[] {
  const words = queryWords(query)
  if (words.length === 0) return items.slice(0, LIMITS.perKind)
  return items
    .map((item, index) => {
      const haystack = fields(item)
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .replace(/_/g, ' ')
      return {
        item,
        index,
        score: words.filter((word) => haystack.includes(word)).length,
      }
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, LIMITS.perKind)
    .map((entry) => entry.item)
}
