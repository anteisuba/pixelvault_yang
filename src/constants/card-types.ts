/**
 * Card system configuration constants
 * Shared limits for BackgroundCard, StyleCard, ModelCard, and CardRecipe
 */

/** Card types in the composable generation system */
export const CARD_TYPES = ['CHARACTER', 'BACKGROUND', 'STYLE', 'MODEL'] as const
export type CardType = (typeof CARD_TYPES)[number]

/** Background card configuration */
export const BACKGROUND_CARD = {
  NAME_MAX_LENGTH: 60,
  DESCRIPTION_MAX_LENGTH: 500,
  MAX_TAGS: 20,
  TAG_MAX_LENGTH: 30,
  MAX_CARDS_PER_USER: 100,
  /** Prompt max length for background description */
  PROMPT_MAX_LENGTH: 2000,
} as const

/** Style card configuration */
export const STYLE_CARD = {
  NAME_MAX_LENGTH: 60,
  DESCRIPTION_MAX_LENGTH: 500,
  MAX_TAGS: 20,
  TAG_MAX_LENGTH: 30,
  MAX_CARDS_PER_USER: 100,
  /** Prompt max length for style description */
  PROMPT_MAX_LENGTH: 2000,
} as const

/** Model card configuration */
export const MODEL_CARD = {
  NAME_MAX_LENGTH: 60,
  DESCRIPTION_MAX_LENGTH: 500,
  MAX_TAGS: 20,
  TAG_MAX_LENGTH: 30,
  MAX_CARDS_PER_USER: 50,
} as const

/** Card recipe configuration */
export const CARD_RECIPE = {
  NAME_MAX_LENGTH: 60,
  MAX_RECIPES_PER_USER: 200,
  /** Free prompt max length (action/pose/expression input) */
  FREE_PROMPT_MAX_LENGTH: 2000,
  /** Token budget per card prompt sent to LLM fusion (characters) */
  PROMPT_TRUNCATION_LIMIT: 800,
  /** Compiled prompt cache TTL in milliseconds (1 hour) */
  CACHE_TTL_MS: 60 * 60 * 1000,
  /** LLM fusion timeout in milliseconds */
  LLM_FUSION_TIMEOUT_MS: 10_000,
} as const
