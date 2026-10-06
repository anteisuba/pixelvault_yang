/**
 * 公开作品给搜索引擎 / 分享卡片 / 读屏看的那段文字。
 *
 * 提示词原文是写给模型的：权重写法（`1.5::foo::`、`(foo:1.2)`）、LoRA 标记、
 * 质量词（masterpiece、best quality）对人没有意义，原样当标题只会是一串标签汤。
 * 这里只做**减法**（去噪、去重、截断），⛔ 不改写、不翻译内容。
 *
 * 纯函数、无 `server-only`：详情页 metadata（服务端）与画廊卡片 alt（客户端）共用。
 */

import {
  GENERATION_SEO_TEXT,
  PROMPT_DISPLAY_NOISE_TAGS,
} from '@/constants/generation-naming'

const NOISE_TAGS = new Set<string>(PROMPT_DISPLAY_NOISE_TAGS)
const NOISE_PATTERNS = [
  /^score \d+( up)?$/, // score_9 / score_8_up
  /^(year )?\d{4}$/, // year 2024
  /^-?\d+(\.\d+)?$/, // NAI 权重剥完剩下的裸数字
]

function isNoiseTag(tag: string): boolean {
  const lower = tag.toLowerCase()
  return NOISE_TAGS.has(lower) || NOISE_PATTERNS.some((re) => re.test(lower))
}

/**
 * 提示词 → 给人看的一段：`a, b, c`。空提示词回空串。
 *
 * 顺序：先剥 LoRA 标记与两种权重写法，再拆括号与 `_`，最后按逗号 / 换行切成
 * 标签、去掉质量词、大小写不敏感去重。自然语言提示词里的逗号原样拼回去。
 */
export function cleanPromptForDisplay(
  prompt: string | null | undefined,
): string {
  if (!prompt) return ''
  const stripped = prompt
    .replace(/<(?:lora|lyco|hypernet):[^>]*>/gi, ' ')
    .replace(/-?\d+(?:\.\d+)?::/g, ',')
    .replace(/::/g, ',')
    .replace(/:\s*-?\d+(?:\.\d+)?\s*(?=[)\]}])/g, '')
    .replace(/\\/g, '')
    .replace(/[()[\]{}<>]/g, ' ')
    .replace(/_/g, ' ')

  const seen = new Set<string>()
  const tags: string[] = []
  for (const raw of stripped.split(/[,\n]/)) {
    const tag = raw.replace(/\s+/g, ' ').trim()
    if (!tag || isNoiseTag(tag)) continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    tags.push(tag)
  }
  // 上一段已经以标点收尾（多行的自然语言提示词）就不再补逗号：
  // 中日文句末标点直接接，拉丁标点后空一格。
  return tags.reduce((text, tag) => {
    if (!text) return tag
    if (/[。！？；，、：]$/.test(text)) return `${text}${tag}`
    if (/[.!?;:]$/.test(text)) return `${text} ${tag}`
    return `${text}, ${tag}`
  }, '')
}

/**
 * 截到 `max` 个字。拉丁文退到最近的逗号或空格（不把词切成两半），CJK 没有
 * 空格就硬切；截过的末尾补 `…`。
 */
export function clampDisplayText(text: string, max: number): string {
  if (text.length <= max) return text
  let cut = text.slice(0, max)
  const boundary = Math.max(cut.lastIndexOf(', '), cut.lastIndexOf(' '))
  if (boundary > max / 2) cut = cut.slice(0, boundary)
  return `${cut.replace(/[,\s、，]+$/, '')}…`
}

/** 详情页标题里那段摘要（不含模型名与站名）。 */
export function buildPromptTitleSummary(
  prompt: string | null | undefined,
): string {
  return clampDisplayText(
    cleanPromptForDisplay(prompt),
    GENERATION_SEO_TEXT.titleSummaryChars,
  )
}

/** meta description / og:description / JSON-LD description。 */
export function buildPromptDescription(
  prompt: string | null | undefined,
): string {
  return clampDisplayText(
    cleanPromptForDisplay(prompt),
    GENERATION_SEO_TEXT.descriptionChars,
  )
}

/** 图片 alt。提示词为空（未公开、上传件）回空串，调用方自己给兜底。 */
export function buildPromptAltText(prompt: string | null | undefined): string {
  return clampDisplayText(
    cleanPromptForDisplay(prompt),
    GENERATION_SEO_TEXT.altChars,
  )
}
