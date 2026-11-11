import { z } from 'zod'

import {
  PUBLISH_BLOCK_EXPLICIT_TERMS,
  PUBLISH_BLOCK_MINOR_TERMS,
  PUBLISH_BLOCK_SUGGESTIVE_TERMS,
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

const hasExplicitTerm = buildMatcher(PUBLISH_BLOCK_EXPLICIT_TERMS)
const hasMinorTerm = buildMatcher(PUBLISH_BLOCK_MINOR_TERMS)
const hasSuggestiveTerm = buildMatcher(PUBLISH_BLOCK_SUGGESTIVE_TERMS)

/**
 * 这条提示词能不能跟着作品公开出去。规则与词表见
 * `constants/content-safety.ts`：有露骨词就拦；未成年词与性暗示词同时出现也拦。
 *
 * `_` 先换成空格，Danbooru 写法（`young_girl`、`spread_legs`）与自然语言走同一套词表。
 */
export function isPromptBlockedFromPublic(
  prompt: string | null | undefined,
): boolean {
  if (!prompt) return false
  const text = prompt.replace(/_/g, ' ')
  return (
    hasExplicitTerm(text) || (hasMinorTerm(text) && hasSuggestiveTerm(text))
  )
}

/**
 * NovelAI 多角色出图时，每个角色的提示词单独存在
 * `recipe.advancedParams.novelAiLayout.characters[].prompt`，不在 `prompt` 列里。
 * 只读这一格、宽松解析：旧行没有 recipe，形状不对就当没有。
 */
const RecipeCharacterPromptsSchema = z.object({
  advancedParams: z.object({
    novelAiLayout: z.object({
      characters: z.array(z.object({ prompt: z.string() })),
    }),
  }),
})

function readCharacterPrompts(recipe: unknown): string[] {
  const parsed = RecipeCharacterPromptsSchema.safeParse(recipe)
  if (!parsed.success) return []
  return parsed.data.advancedParams.novelAiLayout.characters.map(
    (character) => character.prompt,
  )
}

/**
 * 公开闸：这件作品能不能公开，拦下时给出原因码（单张与批量公开共用）。
 * 「先搜再画」出的图按条款一律不能公开；派生图不继承（owner 2026-10-07）。
 */
export function getPublishBlockedErrorCode(generation: {
  prompt: string | null
  recipe?: unknown
  searchGrounded?: boolean
}):
  | typeof PUBLISH_BLOCKED_ERROR_CODE
  | typeof PUBLISH_BLOCKED_SEARCH_GROUNDED_ERROR_CODE
  | null {
  if (generation.searchGrounded)
    return PUBLISH_BLOCKED_SEARCH_GROUNDED_ERROR_CODE
  // 整体提示词和各角色的拼成一段判：未成年词在一个角色、露骨词在另一个也算。
  const prompts = [
    generation.prompt,
    ...readCharacterPrompts(generation.recipe),
  ]
  if (isPromptBlockedFromPublic(prompts.filter(Boolean).join('\n'))) {
    return PUBLISH_BLOCKED_ERROR_CODE
  }
  return null
}
