import { PROMPT_TAG_WEIGHT, PROMPT_TO_TAGS } from '@/constants/prompt-dialects'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { TagTemplateParamsSchema, type TagChip } from '@/types/tag-composer'

/**
 * 标签台的**翻译层**：统一表示 ↔ 存储串 ↔ provider 原生语法。
 *
 * - **界面与存储**（`state.prompt` / `advancedParams.negativePrompt`）：采用
 *   NovelAI V4.5 / V5 原生数值强调串（`1girl, 1.2::rain::, -2::blurry::`），
 *   同时兼容解析历史存储与粘贴的 `rain:1.2` / `blurry:-2` 后缀写法；组件之间仍按
 *   `TagChip[]` 传。
 * - **payload**：`translateTagChips` 按 adapter 落到目标语法 —— NovelAI 无损发
 *   `weight::tag::`（含负权重与多词群组，彻底去掉旧 `{}` 括号取整）；PixAI / LoRA
 *   正权翻 `(tag:1.2)`、非正权（≤ 0）安全剥离；自然语言模型只留正权文本。
 *
 * ⚠ 只有标签台写出来的串才允许被翻译。自然语言台的提示词原样发出去 ——
 * 否则用户写的 `a girl: 1.2 meters tall` 会被当成权重重新拼一遍。判据由调用方
 * 带着 `promptDialect` 传进来，⛔ 这里不猜。
 */

/** NovelAI 原生数值强调：`1.2::tag::`、`-2::blurry::`、`1.5::rain, night::`。 */
const NATIVE_EMPHASIS = /^(-?\d+(?:\.\d+)?)::([\s\S]+?)::$/
/** 兼容历史/快捷后缀写法：`tag:1.2`、`tag:-2`。小数点后最多两位，`1` 省略不写。 */
const WEIGHT_SUFFIX = /^(.*\S)\s*:\s*(-?\d+(?:\.\d+)?)$/

export interface ParsedWeightedSegment {
  kind: 'native' | 'suffix' | 'plain'
  prefix: string
  core: string
  suffix: string
  text: string
  weight: number
}

function isInTagWeightRange(weight: number): boolean {
  return (
    Number.isFinite(weight) &&
    weight >= PROMPT_TAG_WEIGHT.MIN &&
    weight <= PROMPT_TAG_WEIGHT.MAX
  )
}

/**
 * 拆解单个已去空白的标签段，同时供 `parseTagChips` 与文本框镜像高亮复用，
 * 保证编辑态与序列化态对权重的识别完全一致。
 */
export function parseWeightedSegment(piece: string): ParsedWeightedSegment {
  const nativeMatch = NATIVE_EMPHASIS.exec(piece)
  if (nativeMatch) {
    const rawWeight = nativeMatch[1]!
    const core = nativeMatch[2]!
    const weight = Number(rawWeight)
    if (isInTagWeightRange(weight) && core.trim().length > 0) {
      return {
        kind: 'native',
        prefix: `${rawWeight}::`,
        core,
        suffix: '::',
        text: core.trim(),
        weight: snapTagWeight(weight),
      }
    }
  }
  const suffixMatch = WEIGHT_SUFFIX.exec(piece)
  if (suffixMatch) {
    const core = suffixMatch[1]!
    const weight = Number(suffixMatch[2])
    if (isInTagWeightRange(weight) && core.trim().length > 0) {
      return {
        kind: 'suffix',
        prefix: '',
        core,
        suffix: piece.slice(core.length),
        text: core.trim(),
        weight: snapTagWeight(weight),
      }
    }
  }
  return {
    kind: 'plain',
    prefix: '',
    core: piece,
    suffix: '',
    text: piece,
    weight: PROMPT_TAG_WEIGHT.DEFAULT,
  }
}

/**
 * 统一串按逗号切成一段一段的**下标范围**（`[start, end)`，含两边空白，逗号本身不算）。
 * `1.5::rain, night::` 这种数值组与 `{…}` / `[…]` 里的逗号不切 —— 与 `parseTagChips`
 * 同一把刀，标签台纯文本框按光标找「当前这一个标签」也用它。
 */
export function splitTagRanges(
  text: string,
): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = []
  let start = 0
  let numericGroup = false
  let bracketDepth = 0
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (char === ':' && text[index + 1] === ':') {
      if (numericGroup) {
        numericGroup = false
        bracketDepth = 0
      } else if (
        /^\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text.slice(start, index))
      ) {
        numericGroup = true
      }
      index++
    } else if (char === '{' || char === '[') bracketDepth++
    else if (char === '}' || char === ']')
      bracketDepth = Math.max(0, bracketDepth - 1)
    else if (char === ',' && !numericGroup && bracketDepth === 0) {
      ranges.push({ start, end: index })
      start = index + 1
    }
  }
  ranges.push({ start, end: text.length })
  return ranges
}

function splitTagText(text: string): string[] {
  return splitTagRanges(text).map(({ start, end }) => text.slice(start, end))
}

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
  const rounded = Number(stepped.toFixed(2))
  return Object.is(rounded, -0) ? 0 : rounded
}

/** 界面按钮/提示上的倍率文本：`×1.2` / `×-2`。缺省权重不显示（调用方判 `isDefaultTagWeight`）。 */
export function formatTagWeight(weight: number): string {
  return `×${Number(snapTagWeight(weight).toFixed(2))}`
}

export function isDefaultTagWeight(weight: number): boolean {
  return snapTagWeight(weight) === PROMPT_TAG_WEIGHT.DEFAULT
}

/**
 * 标签串 → chip 列表。逗号分隔；同时认 NovelAI 原生 `1.2::tag::` / `-2::tag::`
 * 与旧后缀 `tag:1.2`，**数值越界或不是数字时原样留在文本里**（`bad hands: seriously`
 * / `20::best quality, detailed::` 不会被吃掉）。
 */
export function parseTagChips(text: string): TagChip[] {
  const tags: TagChip[] = []
  for (const raw of splitTagText(text)) {
    const piece = raw.trim()
    if (!piece) continue
    const parsed = parseWeightedSegment(piece)
    tags.push({ text: parsed.text, weight: parsed.weight })
  }
  return tags
}

/** chip 列表 → NovelAI 原生串。缺省权重不写包裹，所以纯标签串进出逐字不变。 */
export function serializeTagChips(tags: readonly TagChip[]): string {
  return tags
    .filter((tag) => tag.text.trim().length > 0)
    .map((tag) => {
      const text = tag.text.trim()
      const weight = snapTagWeight(tag.weight)
      if (weight === PROMPT_TAG_WEIGHT.DEFAULT) return text
      return `${Number(weight.toFixed(2))}::${text}::`
    })
    .join(', ')
}

/**
 * 从自然语言台带过来的那一句 —— 先**整句一格**占位，随后让助手翻成标签来换掉它
 * （owner 2026-09-27；翻不成就留着这一格）。
 * ⛔ 不按逗号切：逗号切出来的是半句话，不是标签。
 */
export function wholeSentenceAsTag(text: string): TagChip[] {
  const trimmed = text.trim()
  return trimmed ? [{ text: trimmed, weight: PROMPT_TAG_WEIGHT.DEFAULT }] : []
}

/** 句读与 CJK 文字：一格里出现它们，就是一句话而不是 danbooru 标签。 */
const SENTENCE_MARK = /[。！？；，、\u3040-\u30ff\u3400-\u9fff]/

/**
 * **助手翻出来的那一串 → 一格一格的标签**（自然语言带到标签台时，owner 2026-09-27）。
 *
 * 模型偶尔会加个「Tags:」前缀、套一层代码块或引号、用换行代替逗号 —— 这些都剥掉；
 * 下划线换成空格（标签台一律按空格写，与 Danbooru 面板同一条）。
 * 长得像一句话的那一格（带中日文、太长、词太多）**丢掉**，大小写不同的重复只留一格。
 * ⚠ 丢掉的超过一半 = 模型没照做（回了一段话），回 `null` 让调用方退回整句一格，
 * ⛔ 不把半截结果当成功。
 */
export function parsePromptToTagsOutput(raw: string): string[] | null {
  const body = raw
    .replace(/^```[a-z]*\s*|```\s*$/gi, '')
    .replace(/^\s*(?:danbooru\s+)?tags?\s*[:：]\s*/i, '')
  const parts = body
    .split(/[,\n]/)
    .map((part) =>
      part
        .trim()
        .replace(/^(?:[-*•]|\d+[.)])\s+/, '')
        .replace(/^["'`]+|["'`.]+$/g, '')
        .replace(/(?<=\w)_(?=\w)/g, ' ')
        .trim(),
    )
    .filter((part) => part.length > 0)
  if (parts.length === 0) return null

  const seen = new Set<string>()
  const tags: string[] = []
  let rejected = 0
  for (const part of parts) {
    const words = part.split(/\s+/).length
    if (
      SENTENCE_MARK.test(part) ||
      part.length > PROMPT_TO_TAGS.maxTagChars ||
      words > PROMPT_TO_TAGS.maxTagWords
    ) {
      rejected += 1
      continue
    }
    const key = part.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    tags.push(part)
  }
  if (tags.length === 0 || rejected * 2 > parts.length) return null
  return tags.slice(0, PROMPT_TO_TAGS.maxTags)
}

function toNovelAiTag(tag: TagChip): string {
  const text = tag.text.trim()
  const weight = snapTagWeight(tag.weight)
  if (weight === PROMPT_TAG_WEIGHT.DEFAULT) return text
  return `${Number(weight.toFixed(2))}::${text}::`
}

function toPixAiTag(tag: TagChip): string {
  const text = tag.text.trim()
  const weight = snapTagWeight(tag.weight)
  if (weight <= 0) return ''
  return isDefaultTagWeight(weight)
    ? text
    : `(${text}:${Number(weight.toFixed(2))})`
}

/**
 * chip 列表 → provider 原生语法。
 *
 * - NovelAI V4.5 / V5：无损输出原生 `weight::tag::`（含负权重与多词群组）。
 * - PixAI：正权输出 `(tag:1.2)`，非正权（≤ 0）剥离（不把避雷词当正向词送出去）。
 * - 其它 adapter：只留正权文本，丢掉权重与非正权（免得括号或避雷词被画进图里）。
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
    return usable.map(toPixAiTag).filter(Boolean).join(', ')
  }
  return usable
    .filter((tag) => snapTagWeight(tag.weight) > 0)
    .map((tag) => tag.text.trim())
    .join(', ')
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

/**
 * 存储串 → LoRA 台的写法（标签模板用在 LoRA 台，pages/prompts.md「使用」）：认括号
 * 权重的底模写成 `(tag:1.2)`，不认的（Flux）去掉权重；非正权（NAI 负强调）剥离。
 */
export function tagPromptTextForLoraBase(
  unifiedText: string,
  weightedParens: boolean,
): string {
  return parseTagChips(unifiedText)
    .filter(
      (tag) => tag.text.trim().length > 0 && snapTagWeight(tag.weight) > 0,
    )
    .map((tag) => (weightedParens ? toPixAiTag(tag) : tag.text.trim()))
    .filter(Boolean)
    .join(', ')
}

/** 这条配方是不是标签模板（标签台只列它们，自然语言台只列其余的）。 */
export function isTagTemplateParams(params: unknown): boolean {
  return TagTemplateParamsSchema.safeParse(params).success
}
