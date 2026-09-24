import { ASSISTANT_NAI_TAG_CHECK } from '@/constants/assistant-operator'
import { PROMPT_TAG_CURATED_DEFINITIONS } from '@/constants/prompt-tags.curated'
import { PROMPT_TAG_DANBOORU_DEFINITIONS } from '@/constants/prompt-tags.danbooru.generated'

/**
 * NAI 标签核对的纯文本半边（拆分与反推 B3）：切段、取核心标签、查本地词表、
 * 挑最接近的候选、写回。查官方联想的那一跳在 `novelai-tags.service.ts`。
 */

export interface NovelAiTagFix {
  from: string
  to: string
}

/** 统一比较口径：小写、下划线当空格、去掉转义括号的反斜杠、空白合一。 */
export function normalizeNovelAiTag(tag: string): string {
  return tag
    .toLowerCase()
    .replace(/\\([()])/g, '$1')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const NON_DANBOORU = new Set<string>(ASSISTANT_NAI_TAG_CHECK.nonDanbooruTags)

/** 规范写法（normalize 后）→ 词表里的正名；别名也指向正名。 */
const LOCAL_TAGS = (() => {
  const map = new Map<string, string>()
  for (const tag of PROMPT_TAG_CURATED_DEFINITIONS)
    map.set(normalizeNovelAiTag(tag.promptText), tag.promptText)
  for (const tag of PROMPT_TAG_DANBOORU_DEFINITIONS) {
    map.set(normalizeNovelAiTag(tag.promptText), tag.promptText)
    for (const alias of tag.aliases ?? []) {
      const key = normalizeNovelAiTag(alias)
      if (!map.has(key)) map.set(key, tag.promptText)
    }
  }
  return map
})()

/**
 * 一段里的核心标签：剥掉 `1.2::…::`、`{…}` / `[…]`、统一串的 `:1.2` 后缀。
 * ⚠ 带冒号（`artist:` · `year 2024` 之外的前缀）、非 ASCII、超过
 * `maxWords` 个词的一段不核对 —— 那是画师标签、要画的字或自然语言。
 */
const CORE =
  /^(\s*(?:-?\d+(?:\.\d+)?::)?[{[]*\s*)([\s\S]*?)(\s*[}\]]*(?:::)?(?:\s*:\s*\d+(?:\.\d+)?)?\s*)$/

function checkableCore(
  piece: string,
): { lead: string; core: string; tail: string } | null {
  const match = CORE.exec(piece)
  if (!match) return null
  const [, lead = '', core = '', tail = ''] = match
  const normalized = normalizeNovelAiTag(core)
  if (!normalized || core.includes(':') || core.includes('|')) return null
  if (!/^[\x20-\x7e]+$/.test(core)) return null
  if (normalized.split(' ').length > ASSISTANT_NAI_TAG_CHECK.maxWords)
    return null
  if (NON_DANBOORU.has(normalized) || /^year \d{4}$/.test(normalized))
    return null
  return { lead, core, tail }
}

/** 逗号切段（与标签台同一口径：`::` 数字组与括号里的逗号不切）。 */
function splitPieces(text: string): string[] {
  const parts: string[] = []
  let start = 0
  let numericGroup = false
  let depth = 0
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (char === ':' && text[index + 1] === ':') {
      numericGroup = /[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(
        text.slice(start, index),
      )
      if (!numericGroup) depth = 0
      index++
    } else if (char === '{' || char === '[') depth++
    else if (char === '}' || char === ']') depth = Math.max(0, depth - 1)
    else if (char === ',' && !numericGroup && depth === 0) {
      parts.push(text.slice(start, index))
      start = index + 1
    }
  }
  parts.push(text.slice(start))
  return parts
}

/** 这一段提示词里要核对的核心标签（去重，按出现顺序）。 */
export function listCheckableNovelAiTags(prompt: string): string[] {
  const body = prompt.split(/\bText:/)[0] ?? ''
  const seen = new Set<string>()
  const tags: string[] = []
  for (const piece of splitPieces(body)) {
    const core = checkableCore(piece)?.core.trim()
    if (core && !seen.has(core)) {
      seen.add(core)
      tags.push(core)
    }
  }
  return tags
}

/** 本地词表里的正名；别名命中也回正名。查不到回 `null`。 */
export function findLocalNovelAiTag(tag: string): string | null {
  return LOCAL_TAGS.get(normalizeNovelAiTag(tag)) ?? null
}

function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++)
      current[j] = Math.min(
        previous[j]! + 1,
        current[j - 1]! + 1,
        previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    previous = current
  }
  return previous[b.length]!
}

/** 词干：连字符当空格、去掉复数尾巴 —— `pleated-skirts` 与 `pleated skirt` 同干。 */
function stemWords(tag: string): string[] {
  return normalizeNovelAiTag(tag)
    .replace(/-/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.replace(/(?:es|s)$/, ''))
    .sort()
}

/**
 * 两个写法是不是**同一个标签**：词序、复数、连字符不同，或每个词至多错一个字母
 * （词长够长）。⛔ 换了词不算（实跑：`multiple waist straps` 按整串编辑距离被
 * 换成了 `multiple thigh straps`，意思变了）。
 */
export function isSameNovelAiTag(a: string, b: string): boolean {
  const left = stemWords(a)
  const right = stemWords(b)
  if (left.length !== right.length) return false
  return left.every((word, index) => {
    const other = right[index]!
    if (word === other) return true
    return (
      Math.min(word.length, other.length) >=
        ASSISTANT_NAI_TAG_CHECK.minTypoWordLength &&
      editDistance(word, other) <= 1
    )
  })
}

/**
 * 从候选里挑「最接近的那个」：正名一致 = 本身就对（回原样）；否则取第一个
 * `isSameNovelAiTag` 的（联想按热度排，第一个就是最常用的写法）；都不是回
 * `null`（查不到）。
 */
export function pickClosestNovelAiTag(
  tag: string,
  candidates: readonly string[],
): string | null {
  const normalized = normalizeNovelAiTag(tag)
  if (candidates.some((item) => normalizeNovelAiTag(item) === normalized))
    return tag
  return (
    candidates.find((candidate) => isSameNovelAiTag(tag, candidate)) ?? null
  )
}

/** 正名按原文的写法落地：原文没下划线就用空格（NAI 官方写法）。 */
export function matchNovelAiTagStyle(original: string, canonical: string) {
  return original.includes('_')
    ? canonical.replace(/ /g, '_')
    : canonical.replace(/_/g, ' ')
}

/**
 * 把核对结果写回提示词：只换核心标签，权重语法与 `Text:` 之后原样保留。
 * ⚠ 换完撞上同一个标签的去掉后来那个（实跑：`cherry tree` → `cherry blossoms`
 * 与原有的 `cherry blossoms` 并存）—— 只去因换写法才重复的，原文自己重复的不动。
 */
export function applyNovelAiTagFixes(
  prompt: string,
  fixes: readonly NovelAiTagFix[],
): string {
  if (fixes.length === 0) return prompt
  const replacement = new Map(fixes.map((fix) => [fix.from, fix.to]))
  const cut = prompt.search(/\bText:/)
  const body = cut < 0 ? prompt : prompt.slice(0, cut)
  const rest = cut < 0 ? '' : prompt.slice(cut)
  /** 已出现过的核心标签 → 那一个是不是换写法换出来的。 */
  const seen = new Map<string, boolean>()
  const pieces = splitPieces(body).flatMap((piece) => {
    const parts = checkableCore(piece)
    if (!parts) return [piece]
    const to = replacement.get(parts.core.trim())
    const key = normalizeNovelAiTag(to ?? parts.core)
    const earlierFixed = seen.get(key)
    if (earlierFixed !== undefined && (earlierFixed || to)) return []
    seen.set(key, Boolean(to))
    return [to ? `${parts.lead}${to}${parts.tail}` : piece]
  })
  return pieces.join(',').replace(/^\s+/, '') + rest
}
