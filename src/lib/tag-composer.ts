import {
  NOVELAI_BRACE_WEIGHT_STEP,
  PROMPT_TAG_WEIGHT,
} from '@/constants/prompt-dialects'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { TagChip } from '@/types/tag-composer'

/**
 * 标签台的**翻译层**：统一表示 ↔ 存储串 ↔ provider 原生语法。
 *
 * 三种串各自的地盘，⛔ 别混：
 * - **界面**：`TagChip[]`，权重一律显示成 `×1.2`。
 * - **存储**（`state.prompt` / `advancedParams.negativePrompt`）：统一串
 *   `1girl, rain:1.2, neon city` —— 方言无关，所以两台之间切换、草稿回灌、
 *   助手读写都读得懂它。
 * - **payload**：`translateTagChips` 按 adapter 翻成 NAI 的 `{tag}` 或
 *   PixAI 的 `(tag:1.2)`，只在发请求那一跳出现。
 *
 * ⚠ 只有标签台写出来的串才允许被翻译。自然语言台的提示词原样发出去 ——
 * 否则用户写的 `a girl: 1.2 meters tall` 会被当成权重重新拼一遍。判据由调用方
 * 带着 `promptDialect` 传进来，⛔ 这里不猜。
 */

/** 统一串里权重的后缀形态：`tag:1.2`。小数点后最多两位，`1` 省略不写。 */
const WEIGHT_SUFFIX = /^(.*\S)\s*:\s*(\d+(?:\.\d+)?)$/

const TAG_SEPARATOR = ','

function clampWeight(weight: number): number {
  if (!Number.isFinite(weight)) return PROMPT_TAG_WEIGHT.DEFAULT
  return Math.min(
    PROMPT_TAG_WEIGHT.MAX,
    Math.max(PROMPT_TAG_WEIGHT.MIN, weight),
  )
}

/** 权重落到统一刻度上（0.05 一档），避免浮点尾巴进串。 */
export function snapTagWeight(weight: number): number {
  const stepped =
    Math.round(clampWeight(weight) / PROMPT_TAG_WEIGHT.STEP) *
    PROMPT_TAG_WEIGHT.STEP
  return Number(stepped.toFixed(2))
}

/** chip 上那个数：`×1.2`。缺省权重不显示（调用方自己判 `isDefaultTagWeight`）。 */
export function formatTagWeight(weight: number): string {
  return `×${Number(snapTagWeight(weight).toFixed(2))}`
}

export function isDefaultTagWeight(weight: number): boolean {
  return snapTagWeight(weight) === PROMPT_TAG_WEIGHT.DEFAULT
}

/**
 * 统一串 → chip 列表。逗号分隔；末尾 `:1.2` 认成权重，**数值越界或不是数字时
 * 原样留在文本里**（`bad hands: seriously` 不会被吃掉半截）。
 */
export function parseTagChips(text: string): TagChip[] {
  const tags: TagChip[] = []
  for (const raw of text.split(TAG_SEPARATOR)) {
    const piece = raw.trim()
    if (!piece) continue
    const match = WEIGHT_SUFFIX.exec(piece)
    if (match) {
      const weight = Number(match[2])
      if (
        Number.isFinite(weight) &&
        weight >= PROMPT_TAG_WEIGHT.MIN &&
        weight <= PROMPT_TAG_WEIGHT.MAX
      ) {
        tags.push({ text: match[1], weight: snapTagWeight(weight) })
        continue
      }
    }
    tags.push({ text: piece, weight: PROMPT_TAG_WEIGHT.DEFAULT })
  }
  return tags
}

/** chip 列表 → 统一串。缺省权重不写后缀，所以纯标签串进出逐字不变。 */
export function serializeTagChips(tags: readonly TagChip[]): string {
  return tags
    .filter((tag) => tag.text.trim().length > 0)
    .map((tag) =>
      isDefaultTagWeight(tag.weight)
        ? tag.text.trim()
        : `${tag.text.trim()}:${Number(snapTagWeight(tag.weight).toFixed(2))}`,
    )
    .join(', ')
}

/**
 * 从自然语言台带过来的那一句 —— **整句一格**（D10 ④ 两台跳转）。
 * ⛔ 不按逗号切：切了就等于替用户把一句话改写成标签，而他并没有要求。
 */
export function wholeSentenceAsTag(text: string): TagChip[] {
  const trimmed = text.trim()
  return trimmed ? [{ text: trimmed, weight: PROMPT_TAG_WEIGHT.DEFAULT }] : []
}

/**
 * 统一权重 → NovelAI 的大括号层数。`{tag}` ×1.05、`[tag]` ÷1.05，所以层数是
 * `ln(w) / ln(1.05)` 取整 —— 落到 NAI 的是**最接近的那一档**，不是逐字的 1.2。
 */
export function novelAiBraceDepth(weight: number): number {
  const w = snapTagWeight(weight)
  if (w === PROMPT_TAG_WEIGHT.DEFAULT) return 0
  return Math.round(Math.log(w) / Math.log(NOVELAI_BRACE_WEIGHT_STEP))
}

function toNovelAiTag(tag: TagChip): string {
  const text = tag.text.trim()
  const depth = novelAiBraceDepth(tag.weight)
  if (depth === 0) return text
  return depth > 0
    ? `${'{'.repeat(depth)}${text}${'}'.repeat(depth)}`
    : `${'['.repeat(-depth)}${text}${']'.repeat(-depth)}`
}

function toPixAiTag(tag: TagChip): string {
  const text = tag.text.trim()
  return isDefaultTagWeight(tag.weight)
    ? text
    : `(${text}:${Number(snapTagWeight(tag.weight).toFixed(2))})`
}

/**
 * chip 列表 → provider 原生语法。
 *
 * 认不出来的 adapter 走**无权重**那一支：把权重丢掉比把 `{}` 发给一个不认它的
 * provider 好 —— 后者会把括号当成提示词里的字面字符画进图里。
 */
export function translateTagChips(
  tags: readonly TagChip[],
  adapterType: AI_ADAPTER_TYPES | undefined,
): string {
  const usable = tags.filter((tag) => tag.text.trim().length > 0)
  if (adapterType === AI_ADAPTER_TYPES.NOVELAI) {
    return usable.map(toNovelAiTag).join(', ')
  }
  if (adapterType === AI_ADAPTER_TYPES.PIXAI) {
    return usable.map(toPixAiTag).join(', ')
  }
  return usable.map((tag) => tag.text.trim()).join(', ')
}

/**
 * 存储串 → provider 原生语法。发请求那一跳的唯一入口。
 *
 * ⚠ 调用方必须先确认这一串**确实出自标签台**（`promptDialect === 'tags'`）。
 */
export function translateTagPromptText(
  unifiedText: string,
  adapterType: AI_ADAPTER_TYPES | undefined,
): string {
  return translateTagChips(parseTagChips(unifiedText), adapterType)
}
