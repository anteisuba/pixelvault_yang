/**
 * 搜索词翻成的标签（`cat_ears`）拿来字面搜自己的东西：提示词里空格、下划线两种写法都有，
 * 而且要整词对上 —— `rain` ⛔ 算进 `training`、`brain`。前后端共用。
 */

/** `cat_ears` → `cat ears`（界面上给人看、拿去搜的那个写法）。 */
export function tagWord(tag: string): string {
  return tag.replace(/_/g, ' ').trim()
}

function wordPattern(word: string): RegExp {
  const body = word
    .trim()
    .split(/[\s_]+/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[\\s_]+')
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, 'iu')
}

/** 这段文字里有没有整词对上其中一个词。 */
export function matchesAnyWord(
  text: string | null | undefined,
  words: readonly string[],
): boolean {
  if (!text || words.length === 0) return false
  return words.some((word) => wordPattern(word).test(text))
}

/**
 * 字面筛出来的在前，`all` 里字面没对上、但整词对上翻出来的词（`words`）的接在后面，
 * 顺序照 `all` 的。库页面在已经载入的列表里用（语义检索第 3 块）。
 */
export function withWordMatches<T>(
  all: readonly T[],
  literal: readonly T[],
  words: readonly string[],
  text: (item: T) => readonly (string | null | undefined)[],
): T[] {
  if (words.length === 0) return [...literal]
  const shown = new Set(literal)
  return [
    ...literal,
    ...all.filter(
      (item) =>
        !shown.has(item) &&
        matchesAnyWord(text(item).filter(Boolean).join('\n'), words),
    ),
  ]
}
