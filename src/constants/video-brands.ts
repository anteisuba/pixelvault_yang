/**
 * Two-tier video model switcher taxonomy (canvas B2).
 *
 * Tier 1 = brand (these strings MUST match the `MODEL_FAMILIES` labels in
 * `models.ts`). Tier 2 = variant (Seedance speed tier, or Kling product track).
 * Provider (fal / VolcEngine) is a SEPARATE low-key control, not a switcher tier.
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
  /** Kling VIDEO 3.0 Pro (multi-shot / first-frame track). */
  v3: 'v3',
  /** Kling VIDEO O3 Pro Omni (element / video-reference track). */
  o3: 'o3',
} as const

export const VIDEO_VARIANTS = [
  VIDEO_VARIANT_IDS.standard,
  VIDEO_VARIANT_IDS.fast,
] as const

export const KLING_VIDEO_VARIANTS = [
  VIDEO_VARIANT_IDS.v3,
  VIDEO_VARIANT_IDS.o3,
] as const

/** Every switcher variant id (Seedance + Kling). Used by Zod project defaults. */
export const ALL_VIDEO_VARIANTS = [
  ...VIDEO_VARIANTS,
  ...KLING_VIDEO_VARIANTS,
] as const

export type VideoVariantId =
  (typeof VIDEO_VARIANT_IDS)[keyof typeof VIDEO_VARIANT_IDS]

/**
 * Variants offered per brand.
 * - Seedance: speed tier (Standard 1080p vs Fast 720p)
 * - Kling: product track (V3 Pro vs O3 Pro Omni) — both are catalog ids under
 *   family "Kling"; without this split the switcher collapses to pickBest(V3)
 * - Veo: single-variant (empty → switcher hides the variant control)
 */
export const VIDEO_BRAND_VARIANTS: Record<string, readonly VideoVariantId[]> = {
  [VIDEO_BRAND_IDS.seedance]: VIDEO_VARIANTS,
  [VIDEO_BRAND_IDS.kling]: KLING_VIDEO_VARIANTS,
  [VIDEO_BRAND_IDS.veo]: [],
}
