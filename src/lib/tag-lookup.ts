import { DANBOORU_REQUEST } from '@/constants/research'
import { PROMPT_TAG_WEIGHT } from '@/constants/prompt-dialects'
import type { TagChip } from '@/types/tag-composer'

/**
 * 查资料（标签台 · owner 2026-09-27 查资料 B）的几条纯规则：Danbooru 的 tag 怎么
 * 显示、加进正向标签时排在哪、画师标签怎么开关。
 */

/** Danbooru 的 tag 名 → 标签台的写法（标签台一律按空格写）。 */
export function displayDanbooruTag(name: string): string {
  return name.replaceAll('_', ' ')
}

/** 画师标签：NovelAI V4 起认 `artist:名字`。 */
export function artistPromptTag(name: string): string {
  return `artist:${displayDanbooruTag(name)}`
}

/** 作品张数的短写：15.2万 / 152K。 */
export function compactPostCount(count: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(count)
}

/**
 * 详情里那一行别名：Danbooru 的 `other_names` 用下划线连词（`hatsune_miku`），读的时候换成
 * 空格；和标题一样的、大小写不同的重复都去掉；只留前几个（排在前面的是各语言的正名，
 * 后面常混进梗名）。
 */
export function lookupAliasLine(
  aliases: readonly string[],
  tag: string,
  limit: number,
): string[] {
  const seen = new Set([displayDanbooruTag(tag).toLowerCase()])
  const line: string[] = []
  for (const alias of aliases) {
    const text = alias.replaceAll('_', ' ').trim()
    const key = text.toLowerCase()
    if (!text || seen.has(key)) continue
    seen.add(key)
    line.push(text)
    if (line.length === limit) break
  }
  return line
}

export function danbooruPostsUrl(tag: string): string {
  const params = new URLSearchParams({
    tags: `${tag} rating:${DANBOORU_REQUEST.safeRating}`,
  })
  return `${DANBOORU_REQUEST.baseUrl}/posts?${params}`
}

export function danbooruPostUrl(id: number): string {
  return `${DANBOORU_REQUEST.baseUrl}/posts/${id}`
}

/** 两边都查不到时给的直链：Danbooru 自己的 tag 模糊搜索。 */
export function danbooruTagSearchUrl(query: string): string {
  const slug = query.trim().toLowerCase().replace(/\s+/g, '_')
  const params = new URLSearchParams({ 'search[name_matches]': `*${slug}*` })
  return `${DANBOORU_REQUEST.baseUrl}/tags?${params}`
}

const isArtistChip = (chip: TagChip) =>
  chip.text.toLowerCase().startsWith('artist:')

/**
 * 把一组标签加进一栏：排在最前面那几个画师标签之后、其余标签之前；已经在这一栏里的
 * （不分大小写）不再加第二遍。
 */
export function addLookupTags(
  chips: readonly TagChip[],
  incoming: readonly string[],
): TagChip[] {
  const taken = new Set(chips.map((chip) => chip.text.toLowerCase()))
  const fresh: TagChip[] = []
  for (const text of incoming) {
    const key = text.toLowerCase()
    if (taken.has(key)) continue
    taken.add(key)
    fresh.push({ text, weight: PROMPT_TAG_WEIGHT.DEFAULT })
  }
  const lead = chips.findIndex((chip) => !isArtistChip(chip))
  const at = lead < 0 ? chips.length : lead
  return [...chips.slice(0, at), ...fresh, ...chips.slice(at)]
}

/** 画风页的「加入」是开关：没有就放到最前面，有了就拿掉。 */
export function toggleArtistTag(
  chips: readonly TagChip[],
  tag: string,
): TagChip[] {
  const key = tag.toLowerCase()
  return chips.some((chip) => chip.text.toLowerCase() === key)
    ? chips.filter((chip) => chip.text.toLowerCase() !== key)
    : [{ text: tag, weight: PROMPT_TAG_WEIGHT.DEFAULT }, ...chips]
}

export function hasTag(chips: readonly TagChip[], tag: string): boolean {
  const key = tag.toLowerCase()
  return chips.some((chip) => chip.text.toLowerCase() === key)
}
