import { z } from 'zod'
import { PROMPT_TAG_WEIGHT } from '@/constants/prompt-dialects'
import { snapTagWeight } from '@/lib/tag-composer'

/**
 * 标签台动态语法与积木编译引擎（Slice 5B-3，纯函数，零 React 依赖）：
 *
 * 1. **行内动态语法**（不破坏纯文本框，也不与旧 `{tag}` 权重语法冲突 —— 仅当括号内含 `|` 时生效）：
 *    - `{red hair|silver hair|blonde hair}` 或 `||red hair|silver hair||`：每次出图随机挑一项；
 *    - `{>serafuku|maid|kimono}`：按顺序轮换（单张连点逐次前进，多张批量每张各取一项）。
 * 2. **可视化积木（`TagPromptBlock`）**：
 *    - `fixed`（固定）：整块所有非空词项合并注入；
 *    - `sequential`（顺序）：按 `cursor` 轮换词项，锁定（`locked`）时钉住当前项不前进；
 *    - `random`（随机）：每次出图随机抽一项并记下 `cursor`，抽中好结果后点锁定即可钉住；
 *    - 整块支持独立 `weight`（落到 NovelAI 原生 `w::...::`）与 `target`（正向 / 负向）。
 */

export const TAG_BLOCK_MODES = ['fixed', 'sequential', 'random'] as const
export type TagBlockMode = (typeof TAG_BLOCK_MODES)[number]

export const TAG_BLOCK_TARGETS = ['positive', 'negative'] as const
export type TagBlockTarget = (typeof TAG_BLOCK_TARGETS)[number]

export const TAG_BLOCK_POSITIONS = ['prefix', 'suffix'] as const
export type TagBlockPosition = (typeof TAG_BLOCK_POSITIONS)[number]

export const TagPromptBlockSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().max(80),
  target: z.enum(TAG_BLOCK_TARGETS).default('positive'),
  /** 注入位置：`prefix` 拼在正文之前（适合画师串/画风基底），`suffix` 拼在正文之后（默认，适合表情/光影）。 */
  position: z.enum(TAG_BLOCK_POSITIONS).default('suffix'),
  mode: z.enum(TAG_BLOCK_MODES).default('fixed'),
  enabled: z.boolean().default(true),
  locked: z.boolean().default(false),
  weight: z
    .number()
    .finite()
    .min(PROMPT_TAG_WEIGHT.MIN)
    .max(PROMPT_TAG_WEIGHT.MAX)
    .default(PROMPT_TAG_WEIGHT.DEFAULT),
  items: z.array(z.string().max(400)).max(50),
  cursor: z.number().int().nonnegative().default(0),
})
export type TagPromptBlock = z.infer<typeof TagPromptBlockSchema>

export const TagPromptBlockListSchema = z.array(TagPromptBlockSchema).max(30)

/** 匹配 `{...}`（内部必须含 `|`，避开无竖线的旧式 `{tag}` 强调）或 NovelAI 原生 `||...||`。 */
const INLINE_DYNAMIC_PATTERN =
  /\|\|([^|]+(?:\|[^|]+)+)\|\||\{([^{}]*\|[^{}]*)\}/g

export function hasInlineDynamicSyntax(text: string): boolean {
  INLINE_DYNAMIC_PATTERN.lastIndex = 0
  return INLINE_DYNAMIC_PATTERN.test(text)
}

/**
 * 展开文本里的行内动态槽位（`{a|b}` / `||a|b||` 随机，`{>a|b}` 顺序轮换）。
 * `sequenceIndex` 由外部步进（单张连点递增，批量出图逐张递增）。
 */
export function expandInlineDynamicSyntax(
  text: string,
  options: {
    sequenceIndex?: number
    rng?: () => number
  } = {},
): string {
  if (!text) return text
  const sequenceIndex = Math.max(0, Math.floor(options.sequenceIndex ?? 0))
  const rng = options.rng ?? Math.random
  INLINE_DYNAMIC_PATTERN.lastIndex = 0
  return text.replace(
    INLINE_DYNAMIC_PATTERN,
    (
      match,
      doublePipeBody: string | undefined,
      braceBody: string | undefined,
    ) => {
      const rawBody = doublePipeBody ?? braceBody ?? ''
      const sequential =
        braceBody !== undefined && rawBody.trimStart().startsWith('>')
      const cleanedBody = sequential ? rawBody.trimStart().slice(1) : rawBody
      const choices = cleanedBody
        .split('|')
        .map((part) => part.trim())
        .filter((part) => part.length > 0)
      if (choices.length === 0) return match
      const pickedIndex = sequential
        ? sequenceIndex % choices.length
        : Math.min(choices.length - 1, Math.floor(rng() * choices.length))
      return choices[pickedIndex]!
    },
  )
}

const NUMERIC_WEIGHT_GROUP_RE = /^(-?\d+(?:\.\d+)?)::([\s\S]+?)::$/

/**
 * 按逗号切开一段内容，`::` 权重组与括号内的逗号不切（用于安全缩放已有 `w::...::` 权重组）。
 */
function splitTopLevelCommas(text: string): string[] {
  const parts: string[] = []
  let start = 0
  let inNumericGroup = false
  let depth = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === ':' && text[i + 1] === ':') {
      inNumericGroup = /[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(
        text.slice(start, i),
      )
      if (!inNumericGroup) depth = 0
      i++
    } else if (ch === '(' || ch === '{' || ch === '[') {
      depth++
    } else if (ch === ')' || ch === '}' || ch === ']') {
      depth = Math.max(0, depth - 1)
    } else if (ch === ',' && !inNumericGroup && depth === 0) {
      parts.push(text.slice(start, i))
      start = i + 1
    }
  }
  parts.push(text.slice(start))
  return parts.map((part) => part.trim()).filter(Boolean)
}

function wrapBlockWeight(content: string, weight: number): string {
  const trimmed = content.trim()
  if (!trimmed) return ''
  const snapped = snapTagWeight(weight)
  if (snapped === PROMPT_TAG_WEIGHT.DEFAULT) return trimmed
  // 内容已含 NovelAI 数值权重组 `w::...::` 时，严禁在外层再套 `::`（非法嵌套语法）：
  // 改为对每段内部权重乘以总倍率（无权重的独立项直接套 `snapped::...::`）。
  if (/-?\d+(?:\.\d+)?::/.test(trimmed)) {
    return splitTopLevelCommas(trimmed)
      .map((segment) => {
        const match = NUMERIC_WEIGHT_GROUP_RE.exec(segment)
        if (!match) return `${Number(snapped.toFixed(2))}::${segment}::`
        const innerWeight = Number(match[1])
        const scaled = snapTagWeight(innerWeight * snapped)
        const body = match[2]!.trim()
        if (scaled === PROMPT_TAG_WEIGHT.DEFAULT) return body
        return `${Number(scaled.toFixed(2))}::${body}::`
      })
      .join(', ')
  }
  return `${Number(snapped.toFixed(2))}::${trimmed}::`
}

export interface ResolvedBlockItem {
  blockId: string
  blockName: string
  target: TagBlockTarget
  position: TagBlockPosition
  rawText: string
  weightedText: string
  pickedIndex: number
}

/** 计算单个积木在给定 `takeIndex`（批量内第几张）下的产出与选中的条目下标。 */
export function resolvePromptBlockForTake(
  block: TagPromptBlock,
  options: { takeIndex?: number; rng?: () => number } = {},
): ResolvedBlockItem | null {
  if (!block.enabled) return null
  const nonEmpty = block.items
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
  if (nonEmpty.length === 0) return null

  const takeIndex = Math.max(0, Math.floor(options.takeIndex ?? 0))
  const rng = options.rng ?? Math.random
  const safeCursor =
    ((Math.floor(block.cursor) % nonEmpty.length) + nonEmpty.length) %
    nonEmpty.length

  let pickedIndex = safeCursor
  let rawText: string

  if (block.mode === 'fixed') {
    pickedIndex = 0
    rawText = nonEmpty.join(', ')
  } else if (block.mode === 'sequential') {
    pickedIndex = block.locked
      ? safeCursor
      : (safeCursor + takeIndex) % nonEmpty.length
    rawText = nonEmpty[pickedIndex]!
  } else {
    pickedIndex = block.locked
      ? safeCursor
      : Math.min(nonEmpty.length - 1, Math.floor(rng() * nonEmpty.length))
    rawText = nonEmpty[pickedIndex]!
  }

  return {
    blockId: block.id,
    blockName: block.name,
    target: block.target,
    position: block.position ?? 'suffix',
    rawText,
    weightedText: wrapBlockWeight(rawText, block.weight),
    pickedIndex,
  }
}

/** 预览下一枪每个启用积木将输出的文案（随机未锁定时显示候选数提示）。 */
export function previewPromptBlock(block: TagPromptBlock): string {
  const nonEmpty = block.items
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
  if (nonEmpty.length === 0) return ''
  const safeCursor =
    ((Math.floor(block.cursor) % nonEmpty.length) + nonEmpty.length) %
    nonEmpty.length
  if (block.mode === 'fixed') return nonEmpty.join(', ')
  if (block.mode === 'sequential' || block.locked) return nonEmpty[safeCursor]!
  return nonEmpty.join(' | ')
}

function joinPromptSegments(
  prefixes: readonly string[],
  base: string,
  suffixes: readonly string[],
): string {
  const parts = [
    ...prefixes.map((item) => item.trim()),
    base.trim(),
    ...suffixes.map((item) => item.trim()),
  ].filter(Boolean)
  return parts.join(', ')
}

export interface CompiledTakePrompt {
  positive: string
  negative: string
  resolvedBlocks: ResolvedBlockItem[]
}

export interface CompileTagBatchResult {
  takes: CompiledTakePrompt[]
  nextBlocks: TagPromptBlock[]
  nextSequenceCounter: number
}

/**
 * 为一整批出图（`count >= 1`）解析可视化积木 + 行内动态语法，同时算出下一轮的
 * `nextBlocks`（顺序块游标前移 `count` 步、随机块记住最近抽中项方便一键锁定）与
 * `nextSequenceCounter`。
 */
export function compileTagPromptBatch(input: {
  basePositive: string
  baseNegative: string
  blocks: readonly TagPromptBlock[]
  count: number
  sequenceCounter: number
  rng?: () => number
}): CompileTagBatchResult {
  const count = Math.max(1, Math.floor(input.count))
  const rng = input.rng ?? Math.random
  const lastPickedByBlockId = new Map<string, number>()
  const takes: CompiledTakePrompt[] = []

  for (let takeIndex = 0; takeIndex < count; takeIndex++) {
    const seq = input.sequenceCounter + takeIndex
    const resolvedBlocks: ResolvedBlockItem[] = []
    const posPrefixes: string[] = []
    const posSuffixes: string[] = []
    const negPrefixes: string[] = []
    const negSuffixes: string[] = []

    for (const block of input.blocks) {
      const resolved = resolvePromptBlockForTake(block, { takeIndex, rng })
      if (!resolved) continue
      resolvedBlocks.push(resolved)
      lastPickedByBlockId.set(block.id, resolved.pickedIndex)
      if (resolved.target === 'negative') {
        if (resolved.position === 'prefix')
          negPrefixes.push(resolved.weightedText)
        else negSuffixes.push(resolved.weightedText)
      } else {
        if (resolved.position === 'prefix')
          posPrefixes.push(resolved.weightedText)
        else posSuffixes.push(resolved.weightedText)
      }
    }

    const positive = expandInlineDynamicSyntax(
      joinPromptSegments(posPrefixes, input.basePositive, posSuffixes),
      { sequenceIndex: seq, rng },
    )
    const negative = expandInlineDynamicSyntax(
      joinPromptSegments(negPrefixes, input.baseNegative, negSuffixes),
      { sequenceIndex: seq, rng },
    )
    takes.push({ positive, negative, resolvedBlocks })
  }

  const nextBlocks = input.blocks.map((block) => {
    const nonEmptyCount = block.items.filter(
      (item) => item.trim().length > 0,
    ).length
    if (!block.enabled || nonEmptyCount === 0 || block.locked) return block
    if (block.mode === 'sequential') {
      return {
        ...block,
        cursor: (block.cursor + count) % nonEmptyCount,
      }
    }
    if (block.mode === 'random') {
      const lastPicked = lastPickedByBlockId.get(block.id)
      return lastPicked !== undefined ? { ...block, cursor: lastPicked } : block
    }
    return block
  })

  const hasDynamicSeq =
    input.basePositive.includes('{>') ||
    input.baseNegative.includes('{>') ||
    input.blocks.some(
      (block) =>
        block.enabled && block.items.some((item) => item.includes('{>')),
    )

  return {
    takes,
    nextBlocks,
    nextSequenceCounter: hasDynamicSeq
      ? input.sequenceCounter + count
      : input.sequenceCounter,
  }
}

export function hasActiveDynamicCompilation(input: {
  basePositive: string
  baseNegative: string
  blocks: readonly TagPromptBlock[]
  characterPrompts?: readonly string[]
}): boolean {
  if (
    hasInlineDynamicSyntax(input.basePositive) ||
    hasInlineDynamicSyntax(input.baseNegative)
  ) {
    return true
  }
  if (input.characterPrompts?.some((text) => hasInlineDynamicSyntax(text))) {
    return true
  }
  return input.blocks.some(
    (block) =>
      block.enabled && block.items.some((item) => item.trim().length > 0),
  )
}
