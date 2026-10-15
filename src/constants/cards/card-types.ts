/**
 * Card system configuration constants
 * Shared limits for BackgroundCard, StyleCard, and CardRecipe
 */

/** Card types in the composable generation system */
export const CARD_TYPES = ['CHARACTER', 'BACKGROUND', 'STYLE'] as const
export type CardType = (typeof CARD_TYPES)[number]

/** Background card configuration */
export const BACKGROUND_CARD = {
  NAME_MAX_LENGTH: 60,
  DESCRIPTION_MAX_LENGTH: 500,
  MAX_TAGS: 20,
  TAG_MAX_LENGTH: 30,
  MAX_CARDS_PER_USER: 100,
} as const

/** Style card configuration */
export const STYLE_CARD = {
  NAME_MAX_LENGTH: 60,
  DESCRIPTION_MAX_LENGTH: 500,
  MAX_TAGS: 20,
  TAG_MAX_LENGTH: 30,
  MAX_CARDS_PER_USER: 100,
} as const

/** Card recipe configuration */
export const CARD_RECIPE = {
  NAME_MAX_LENGTH: 60,
  MAX_RECIPES_PER_USER: 200,
  /** Compiled prompt cache TTL in milliseconds (1 hour) */
  CACHE_TTL_MS: 60 * 60 * 1000,
  /** LLM fusion timeout in milliseconds */
  LLM_FUSION_TIMEOUT_MS: 10_000,
} as const

/**
 * 卡片融合没走助手、只按原文拼接时**照实说一句**（owner 2026-10-15：⛔ 悄悄回落模板）。
 * `noAssistantKey` = 助手那一家没 key（一把都没有，或选定的模型那一家没有）。
 */
export const CARD_RECIPE_FUSION_NOTES = {
  noAssistantKey: 'noAssistantKey',
} as const

export type CardRecipeFusionNote =
  (typeof CARD_RECIPE_FUSION_NOTES)[keyof typeof CARD_RECIPE_FUSION_NOTES]
