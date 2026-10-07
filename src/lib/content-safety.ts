import {
  PUBLISH_BLOCK_MINOR_TERMS,
  PUBLISH_BLOCK_SEXUAL_TERMS,
  PUBLISH_BLOCKED_ERROR_CODE,
  PUBLISH_BLOCKED_SEARCH_GROUNDED_ERROR_CODE,
} from '@/constants/content-safety'

const LATIN_TERM = /^[a-z ]+$/

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 一张词表 → 一个匹配器。拉丁词按词边界（前后不能是字母，于是 `bra` 不会命中
 * `brave`、`kid` 不会命中 `kidney`）；CJK 没有词边界，按子串。
 */
function buildMatcher(terms: readonly string[]): (text: string) => boolean {
  const latin = terms.filter((term) => LATIN_TERM.test(term))
  const cjk = terms.filter((term) => !LATIN_TERM.test(term))
  const latinPattern = latin.length
    ? new RegExp(
        `(?<![a-z])(?:${latin.map(escapeRegExp).join('|')})(?![a-z])`,
        'i',
      )
    : null
  return (text) =>
    (latinPattern?.test(text) ?? false) ||
    cjk.some((term) => text.includes(term))
}

const hasMinorTerm = buildMatcher(PUBLISH_BLOCK_MINOR_TERMS)
const hasSexualTerm = buildMatcher(PUBLISH_BLOCK_SEXUAL_TERMS)

/**
 * 这条提示词能不能跟着作品公开出去。规则与词表见
 * `constants/content-safety.ts`：未成年词与性相关词同时出现就拦。
 *
 * `_` 先换成空格，Danbooru 写法（`young_girl`、`spread_legs`）与自然语言走同一套词表。
 */
export function isPromptBlockedFromPublic(
  prompt: string | null | undefined,
): boolean {
  if (!prompt) return false
  const text = prompt.replace(/_/g, ' ')
  return hasMinorTerm(text) && hasSexualTerm(text)
}

/**
 * 公开闸：这件作品能不能公开，拦下时给出原因码（单张与批量公开共用）。
 * 「先搜再画」出的图按条款一律不能公开；派生图不继承（owner 2026-10-07）。
 */
export function getPublishBlockedErrorCode(generation: {
  prompt: string | null
  searchGrounded?: boolean
}):
  | typeof PUBLISH_BLOCKED_ERROR_CODE
  | typeof PUBLISH_BLOCKED_SEARCH_GROUNDED_ERROR_CODE
  | null {
  if (generation.searchGrounded)
    return PUBLISH_BLOCKED_SEARCH_GROUNDED_ERROR_CODE
  if (isPromptBlockedFromPublic(generation.prompt)) {
    return PUBLISH_BLOCKED_ERROR_CODE
  }
  return null
}
