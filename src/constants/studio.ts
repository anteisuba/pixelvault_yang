export const STUDIO_PROMPT_TEXTAREA_ID = 'studio-prompt-textarea' as const
export const STUDIO_PREFILL_PROMPT_STORAGE_KEY =
  'pixelvault:studio-prefill-prompt' as const

export const STUDIO_IMAGE_ASPECT_RATIOS = ['1:1', '16:9', '9:16'] as const

// Video supports portrait + landscape + the 4:3 family because most i2v
// models accept those ratios. Keeping the order aligned with image so the
// shared picker UI feels consistent across modes.
export const STUDIO_VIDEO_ASPECT_RATIOS = [
  '1:1',
  '16:9',
  '9:16',
  '4:3',
  '3:4',
] as const

export const STUDIO_CARD_SORT_OPTIONS = ['recent', 'created', 'name'] as const

// ── B5: Batch Variants ──────────────────────────────────────────
export const VARIANT_COUNT = 4
export const VARIANT_GRID_COLS = 2
export const VARIANT_MAX_SEED = 4294967295

// ── B4: Multi-Model Compare ────────────────────────────────────
export const COMPARE_MAX_MODELS = 3
