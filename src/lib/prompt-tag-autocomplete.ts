import { PROMPT_TAG_POPULARITY_TIER_THRESHOLDS } from '@/constants/prompt-tags'

/**
 * lora-workbench.md §5：正文 textarea 内联 tag 补全的纯文本逻辑（无 DOM/React
 * 依赖，独立可测）。「词段」= 光标所在、以最近 `,` 或换行为界的一段文本——
 * 用户在 textarea 里逗号分隔地敲词，补全只关心光标之前、当前正在敲的那一段。
 */
export interface PromptTagSegment {
  /** 词段起点（跳过分隔符后紧邻的空白），闭区间 */
  start: number
  /** 词段终点 = 光标位置，闭区间外 */
  end: number
  /** [start, end) 原文，未 trim（分隔符与前导空白已被 start 跳过，故无需再 trim start；结尾就是光标本身） */
  text: string
}

/**
 * 从 value + 光标位置解出当前词段。找不到非空白内容（光标紧跟分隔符/在
 * 空白中）时返回 null——调用方据此判断"无词段可补"，不触发搜索。
 */
export function extractPromptTagSegment(
  value: string,
  cursorPos: number,
): PromptTagSegment | null {
  const cursor = Math.max(0, Math.min(cursorPos, value.length))
  const lastComma = value.lastIndexOf(',', cursor - 1)
  const lastNewline = value.lastIndexOf('\n', cursor - 1)
  let start = Math.max(lastComma, lastNewline) + 1
  while (start < cursor && /\s/.test(value[start] ?? '')) start++
  if (start >= cursor) return null
  return { start, end: cursor, text: value.slice(start, cursor) }
}

/**
 * 选中一个补全结果后的替换结果：词段整体换成 `promptText + ', '`，光标落在
 * 插入内容之后（"光标落尾"）。词段之后的原文（若光标不在字符串末尾）原样
 * 保留，只换用户当前正在敲的这一段。
 */
export function applyPromptTagSegmentReplacement(
  value: string,
  segment: PromptTagSegment,
  promptText: string,
): { value: string; cursor: number } {
  const insertion = `${promptText}, `
  const nextValue =
    value.slice(0, segment.start) + insertion + value.slice(segment.end)
  return { value: nextValue, cursor: segment.start + insertion.length }
}

export type PromptTagPopularityTier = 'low' | 'mid' | 'high'

/**
 * popularity（0–50，见 constants/prompt-tags.danbooru.generated.ts）映射三档
 * 不透明度——NovelAI 熟悉度圆点的直译，无彩（守颜料纪律），三色阶靠
 * bg-muted-foreground 的 opacity 修饰符区分，不引入新色相。
 */
export function getPromptTagPopularityTier(
  popularity: number | undefined,
): PromptTagPopularityTier {
  const value = popularity ?? 0
  if (value >= PROMPT_TAG_POPULARITY_TIER_THRESHOLDS.high) return 'high'
  if (value >= PROMPT_TAG_POPULARITY_TIER_THRESHOLDS.mid) return 'mid'
  return 'low'
}
