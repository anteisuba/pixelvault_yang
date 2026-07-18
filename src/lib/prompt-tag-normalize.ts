import { LORA_TAG_NORMALIZE_MIN_FIELD_LENGTH } from '@/constants/lora-assistant'
import { PROMPT_TAG_DEFINITIONS } from '@/constants/prompt-tags'
import { normalizePromptTagSearchText } from '@/lib/prompt-tag-search'
import type { PromptAssistantLoraTag } from '@/types'
import type { PromptTagDefinition } from '@/types/prompt-tags'

/**
 * LoRA 转换引擎 v2 出参侧规范化管线（docs/plans/lora-assistant-nl2tag-2026-07.md
 * §2.1 + §2.3，F1 切片）。纯函数，无 server-only 依赖，可单测。
 *
 * 三态：
 *  - 精确命中（`canonical` 且无 `normalized`）：LLM 输出的文本本身就是某个
 *    词库条目的 promptText/label/alias（忽略大小写与下划线/空格差异）。
 *  - 模糊命中（`canonical` + `normalized: true`）：LLM 输出的词序列是某个
 *    词库条目字段词序列的连续子序列或超序列（例如多写/少写了一个修饰词），
 *    替换为该条目的规范形。
 *  - 自由词（`free: true`）：词库未命中，原文保留，UI 渲染为虚线灰 chip。
 *
 * 注 1：这里没有复用 `searchPromptTags`（S6 inline 补全用的检索）——那个函数
 * 只做"词库字段包含查询词"单向匹配（为打字自动补全设计：用户敲几个字符，
 * 找包含它的完整 tag），查询词一旦比词库字段长（LLM 常见输出，比如多写一个
 * 修饰词的"silver hair color"）就永远搜不到任何候选。
 *
 * 注 2（真机实测踩坑修的 bug）：最初按「双向字符子串」实现过一版——
 * `field.includes(raw) || raw.includes(field)`——结果真实词库上炸出两类假阳性：
 * 二字母 alias "ol"（office_lady 的缩写）在字符层面是 "g-OL-den hour" 的子串，
 * 把 "golden hour" 错标成 office_lady；"cape" 是 "land-CAPE" 的子串，把
 * "snowy landscape" 错标成 cape。两个都是**跨词边界**的字符巧合，不是真的语义
 * 匹配。改成按空格分词后的**词序列**做连续子序列匹配（`isTokenSubsequence`），
 * 单词边界内匹配，上面两个假阳性都不再命中，同时仍覆盖"silver hair" ⊂
 * "silver hair color" 这类真实的多写/少写场景。
 */
export type NormalizedLoraAssistantTag = PromptAssistantLoraTag

export interface LoraAssistantOutputFilterContext {
  /** 挂载 LoRA 的全部触发词（含 alternates）——绝不允许出现在输出里。 */
  triggerWords: readonly string[]
  /** tray 已有的 tag 文本——不重复输出。 */
  trayTags: readonly string[]
}

type TagMatchQuality = 'exact' | 'fuzzy' | 'none'

function tokenize(normalized: string): string[] {
  return normalized.split(' ').filter(Boolean)
}

/** 词边界安全的"包含"判定：`needle` 的词序列是否整段连续出现在
 *  `haystack` 的词序列里（不跨词边界，不做字符层面的子串匹配）。 */
function isTokenSubsequence(needle: string[], haystack: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false
  for (let start = 0; start <= haystack.length - needle.length; start += 1) {
    let matched = true
    for (let i = 0; i < needle.length; i += 1) {
      if (haystack[start + i] !== needle[i]) {
        matched = false
        break
      }
    }
    if (matched) return true
  }
  return false
}

/** 双向词序列包含：a 是 b 的连续子序列，或 b 是 a 的连续子序列。 */
function tokensOverlap(normalizedA: string, normalizedB: string): boolean {
  const tokensA = tokenize(normalizedA)
  const tokensB = tokenize(normalizedB)
  if (tokensA.length === 0 || tokensB.length === 0) return false
  return (
    isTokenSubsequence(tokensA, tokensB) || isTokenSubsequence(tokensB, tokensA)
  )
}

function tagFields(tag: PromptTagDefinition): string[] {
  return [
    normalizePromptTagSearchText(tag.promptText),
    normalizePromptTagSearchText(tag.label),
    ...tag.aliases.map(normalizePromptTagSearchText),
  ].filter((field) => field.length > 0)
}

function tagMatchQuality(
  normalizedRaw: string,
  tag: PromptTagDefinition,
): TagMatchQuality {
  const fields = tagFields(tag)

  if (fields.some((field) => field === normalizedRaw)) return 'exact'

  const hasFuzzyMatch = fields.some((field) => {
    if (field.length < LORA_TAG_NORMALIZE_MIN_FIELD_LENGTH) return false
    return tokensOverlap(field, normalizedRaw)
  })
  return hasFuzzyMatch ? 'fuzzy' : 'none'
}

function buildTagHit(
  text: string,
  tag: PromptTagDefinition,
  fuzzy: boolean,
): NormalizedLoraAssistantTag {
  return {
    text,
    canonical: tag.promptText,
    category: tag.category,
    popularity: tag.popularity,
    ...(fuzzy ? { normalized: true } : {}),
  }
}

/**
 * 单个 tag 过词库规范化。对整部词库做一次线性扫描（与 `searchPromptTags`
 * 本身在每次自动补全按键时做的规模同量级，单次助手回复只调用
 * positive+negative 条数次，性能可忽略）：优先返回任意精确命中；找不到
 * 精确命中时，返回扫描到的第一个模糊命中（curated 词库排在 danbooru
 * 词库之前，天然优先精选词条）。
 */
export function normalizeLoraAssistantTag(
  rawTag: string,
  definitions: readonly PromptTagDefinition[] = PROMPT_TAG_DEFINITIONS,
): NormalizedLoraAssistantTag {
  const text = rawTag.trim()
  if (!text) return { text: rawTag, free: true }

  const normalizedRaw = normalizePromptTagSearchText(text)
  if (normalizedRaw.length < LORA_TAG_NORMALIZE_MIN_FIELD_LENGTH) {
    return { text, free: true }
  }

  let fuzzyMatch: PromptTagDefinition | null = null
  for (const tag of definitions) {
    const quality = tagMatchQuality(normalizedRaw, tag)
    if (quality === 'exact') return buildTagHit(text, tag, false)
    if (quality === 'fuzzy' && !fuzzyMatch) fuzzyMatch = tag
  }

  if (fuzzyMatch) return buildTagHit(text, fuzzyMatch, true)
  return { text, free: true }
}

/**
 * 过滤 LLM 原始输出数组：trim 空白、按规范化文本去重、剔除触发词与 tray
 * 已有词（精确匹配 + 词边界安全的双向词序列匹配，短词有最短长度守卫防
 * 误杀）。这是「触发词绝不出现在输出」的兜底执行层——系统提示只是指导，
 * 这里是强制保证。
 */
export function filterLoraAssistantOutputTags(
  rawTags: readonly string[],
  context: LoraAssistantOutputFilterContext,
): string[] {
  const blockedTerms = [...context.triggerWords, ...context.trayTags]
    .map((term) => normalizePromptTagSearchText(term))
    .filter((term) => term.length > 0)

  const seen = new Set<string>()
  const result: string[] = []

  for (const raw of rawTags) {
    const text = raw.trim()
    if (!text) continue
    const normalized = normalizePromptTagSearchText(text)
    if (seen.has(normalized)) continue

    const isBlocked = blockedTerms.some((term) => {
      if (normalized === term) return true
      if (term.length < LORA_TAG_NORMALIZE_MIN_FIELD_LENGTH) return false
      return tokensOverlap(term, normalized)
    })
    if (isBlocked) continue

    seen.add(normalized)
    result.push(text)
  }

  return result
}

/**
 * F1 出参管线入口：过滤（触发词/tray/去重）再逐个规范化。`positive` /
 * `negative` 数组各调用一次。
 */
export function buildLoraAssistantTagResults(
  rawTags: readonly string[],
  context: LoraAssistantOutputFilterContext,
  definitions?: readonly PromptTagDefinition[],
): NormalizedLoraAssistantTag[] {
  return filterLoraAssistantOutputTags(rawTags, context).map((tag) =>
    normalizeLoraAssistantTag(tag, definitions),
  )
}
