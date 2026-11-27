import { displayDanbooruTag, stylePromptTag } from '@/lib/tag-lookup'
import type { NovelAiTagSuggestionSource } from '@/types/novelai-tags'

/**
 * 标签识别度、双语查询判定与 Danbooru 键名规范化（纯函数，前后端共用）。
 *
 * - ASCII 查询至少 2 个字符（避免敲单字母狂发联想请求）；含非 ASCII（中文 / 日文等）
 *   1 个字就已有明确词义（「雨」「猫」「剑」），立即允许联想。
 * - NAI 认知度分四档：优先看官方 / Danbooru 样本量（`count`），次看官方 `confidence`，
 *   再看来源，守无彩颜料纪律（靠不透明度与轻量文字区分）。
 */

export type NovelAiRecognitionTier = 'high' | 'mid' | 'low' | 'unknown'

export const NOVELAI_RECOGNITION_THRESHOLDS = {
  highCount: 10_000,
  midCount: 1_000,
  highConfidence: 0.65,
  midConfidence: 0.3,
} as const

/** 是否包含非 ASCII 字符（中文、日文、韩文等）。 */
export function hasCjkOrNonAscii(text: string): boolean {
  return /[^\x00-\x7f]/.test(text)
}

/** 补全查询是否满足最短长度：非 ASCII ≥ 1 字，ASCII ≥ 2 字符，最长 200。 */
export function isValidTagAutocompleteQuery(query: string): boolean {
  const trimmed = query.trim()
  if (trimmed.length === 0 || trimmed.length > 200) return false
  return hasCjkOrNonAscii(trimmed) || trimmed.length >= 2
}

/**
 * 提示词里的单段标签 → `DanbooruTagName.tag` 主键（下划线小写）。
 * 剥掉 `artist:` 前缀、转义括号反斜杠，空格归并成 `_`。
 */
export function toDanbooruUnderscoreTag(tag: string): string {
  return tag
    .trim()
    .replace(/^artist\s*:\s*/i, '')
    .replace(/\\([()])/g, '$1')
    .toLowerCase()
    .replace(/\s+/g, '_')
}

/**
 * `DanbooruTagName` 一行 → 标签台写入串：
 * 画师分类（category 1）走 `stylePromptTag`（画师写成 `artist:名字`，画法原样空格）；
 * 其余分类把下划线换成空格。
 */
export function formatNovelAiTagDisplay(
  underscoreTag: string,
  category?: number,
): string {
  if (category === 1) return stylePromptTag(underscoreTag)
  return displayDanbooruTag(underscoreTag)
}

/** 判定单个标签在 NAI / Danbooru 语料中的认知度档位。 */
export function getNovelAiRecognitionTier(input: {
  count?: number
  confidence?: number
  source?: NovelAiTagSuggestionSource
  known?: boolean
}): NovelAiRecognitionTier {
  if (typeof input.count === 'number' && input.count > 0) {
    if (input.count >= NOVELAI_RECOGNITION_THRESHOLDS.highCount) return 'high'
    if (input.count >= NOVELAI_RECOGNITION_THRESHOLDS.midCount) return 'mid'
    return 'low'
  }
  if (typeof input.confidence === 'number' && input.confidence > 0) {
    if (input.confidence >= NOVELAI_RECOGNITION_THRESHOLDS.highConfidence)
      return 'high'
    if (input.confidence >= NOVELAI_RECOGNITION_THRESHOLDS.midConfidence)
      return 'mid'
    return 'low'
  }
  if (input.source === 'official' || input.known) return 'mid'
  return 'unknown'
}

/** 按界面语言取本地译名（中文取 `zh`，日文取 `ja`，其余语言不附加冗余译名）。 */
export function pickLocalizedTagName(
  names: { zh?: string | null; ja?: string | null },
  locale: string,
): string | null {
  if (locale.startsWith('zh')) return names.zh ?? null
  if (locale.startsWith('ja')) return names.ja ?? null
  return null
}
