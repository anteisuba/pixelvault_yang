/**
 * Two-tier video model switcher taxonomy (canvas B2).
 *
 * Tier 1 = brand (these strings MUST match the `MODEL_FAMILIES` labels in
 * `models.ts`). Tier 2 = variant (speed tier). Provider (fal / VolcEngine) is a
 * SEPARATE low-key control, not a switcher tier.
 * Reference-ness is mode-by-input (auto), never a tier. Only the brands listed
 * here are surfaced in the canvas switcher; other wired video families
 * (LTX / HappyHorse) stay hidden.
 */

export const VIDEO_BRAND_IDS = {
  seedance: 'Seedance',
  kling: 'Kling',
  veo: 'Veo',
} as const

export const SURFACED_VIDEO_BRANDS = [
  VIDEO_BRAND_IDS.seedance,
  VIDEO_BRAND_IDS.kling,
  VIDEO_BRAND_IDS.veo,
] as const

export type SurfacedVideoBrand = (typeof SURFACED_VIDEO_BRANDS)[number]

export const VIDEO_VARIANT_IDS = {
  standard: 'standard',
  fast: 'fast',
} as const

export const VIDEO_VARIANTS = [
  VIDEO_VARIANT_IDS.standard,
  VIDEO_VARIANT_IDS.fast,
] as const

export type VideoVariantId = (typeof VIDEO_VARIANTS)[number]

/**
 * Variants offered per brand. Only Seedance ships a speed-tier split today
 * (Standard 1080p vs Fast 720p); Kling / Veo are single-variant (empty → the
 * switcher hides the variant control).
 */
export const VIDEO_BRAND_VARIANTS: Record<string, readonly VideoVariantId[]> = {
  [VIDEO_BRAND_IDS.seedance]: VIDEO_VARIANTS,
  [VIDEO_BRAND_IDS.kling]: [],
  [VIDEO_BRAND_IDS.veo]: [],
}
