/**
 * Feature flags — minimal env-var based system.
 *
 * Set `NEXT_PUBLIC_FF_*` environment variables per Vercel environment
 * (production / preview / development) to toggle features independently.
 *
 * Usage:
 *   import { FEATURE_FLAGS } from '@/constants/feature-flags'
 *   if (FEATURE_FLAGS.smartPrompt) { ... }
 */

export const FEATURE_FLAGS = {
  /** B6: Model-aware prompt suggestions, scenario templates, inspiration presets */
  smartPrompt: process.env.NEXT_PUBLIC_FF_SMART_PROMPT === 'true',

  /** B5: Same-model 4-variant generation with different seeds */
  variantGeneration: process.env.NEXT_PUBLIC_FF_VARIANT_GEN === 'true',

  /** B4: Side-by-side multi-model comparison generation */
  multiModelCompare: process.env.NEXT_PUBLIC_FF_MULTI_COMPARE === 'true',

  /** C3: Instruction-based image editing (inpaint / outpaint / Kontext edit) */
  imageEditing: process.env.NEXT_PUBLIC_FF_IMAGE_EDITING === 'true',

  /** C2: Series mode with character consistency chaining */
  seriesMode: process.env.NEXT_PUBLIC_FF_SERIES_MODE === 'true',

  /**
   * Comfy Runner (RunPod Serverless ComfyUI) — faithful Civitai recipe
   * clones for Illustrious/Anima/Pony/SDXL. Owner-only single-endpoint infra
   * (scale-to-zero, $10/month prepaid budget), so it stays behind a flag even
   * once the code ships. See docs/plans/comfy-runner-HANDOFF-2026-07.md.
   */
  comfyRunner: process.env.NEXT_PUBLIC_FF_COMFY_RUNNER === 'true',
} as const

export type FeatureFlag = keyof typeof FEATURE_FLAGS
