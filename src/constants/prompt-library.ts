import type { OutputType } from '@/types'

/**
 * Output types a prompt template can be created/edited with.
 * MODEL_3D was removed from the template taxonomy (2026-07-05) — prompt
 * templates cover image / video / audio only. Legacy MODEL_3D recipes are
 * still rendered via PROMPT_OUTPUT_TYPE_LABEL_KEYS for backward compat.
 */
export const PROMPT_TEMPLATE_OUTPUT_TYPES = [
  'IMAGE',
  'VIDEO',
  'AUDIO',
] as const satisfies readonly OutputType[]

export type PromptTemplateOutputType =
  (typeof PROMPT_TEMPLATE_OUTPUT_TYPES)[number]

/**
 * Recipe (prompt template) visibility. `PUBLIC` templates surface in the
 * shared prompt library ("共享提示词库") as community-shared prompts; `PRIVATE`
 * ones stay in the owner's library only. Mirrors the `Recipe.visibility`
 * column (default `PRIVATE`).
 */
export const RECIPE_VISIBILITY = {
  PRIVATE: 'PRIVATE',
  PUBLIC: 'PUBLIC',
} as const

export type RecipeVisibility =
  (typeof RECIPE_VISIBILITY)[keyof typeof RECIPE_VISIBILITY]

export const RECIPE_VISIBILITY_VALUES = [
  RECIPE_VISIBILITY.PRIVATE,
  RECIPE_VISIBILITY.PUBLIC,
] as const

/** Marker `source` for community recipes surfaced in the shared library feed. */
export const USER_RECIPE_INSPIRATION_SOURCE = 'user_recipe'

/** i18n keys (PromptLibrary namespace) for every output type incl. legacy. */
export const PROMPT_OUTPUT_TYPE_LABEL_KEYS: Record<OutputType, string> = {
  IMAGE: 'outputTypeImage',
  VIDEO: 'outputTypeVideo',
  AUDIO: 'outputTypeAudio',
  MODEL_3D: 'outputType3d',
}

/** Coerce any OutputType into the template taxonomy (legacy 3D → image). */
export function toPromptTemplateOutputType(
  outputType: OutputType | undefined,
): PromptTemplateOutputType {
  if (outputType === 'VIDEO' || outputType === 'AUDIO') return outputType
  return 'IMAGE'
}
