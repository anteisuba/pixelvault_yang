/**
 * Supported AI model identifiers: single source of truth for every place the
 * platform references a built-in model. Keep entries grouped by output type
 * and update the corresponding option file plus i18n when changing this enum.
 */
export enum AI_MODELS {
  // Image models
  GEMINI_FLASH_IMAGE = 'gemini-3.1-flash-image-preview',
  OPENAI_GPT_IMAGE_2 = 'gpt-image-2',
  FLUX_2_PRO = 'flux-2-pro',
  FLUX_2_FLASH = 'flux-2-flash',
  FLUX_LORA = 'flux-lora',
  GEMINI_PRO_IMAGE = 'gemini-3-pro-image-preview',
  IDEOGRAM_3 = 'ideogram-3',
  SEEDREAM_45 = 'seedream-4.5',
  /** Seedream 4.5 via VolcEngine (火山方舟) direct API — cn region. */
  SEEDREAM_45_VOLCENGINE = 'seedream-4.5-volcengine',
  NOVELAI_V45_FULL = 'nai-diffusion-4-5-full',
  NOVELAI_V45_CURATED = 'nai-diffusion-4-5-curated',
  ILLUSTRIOUS_XL = 'illustrious-xl',
  ANIMA_PENCIL_XL = 'anima-pencil-xl',
  RECRAFT_V4_PRO = 'recraft-v4-pro',
  FLUX_KONTEXT_MAX = 'flux-kontext-max',
  /** Comfy Runner (RunPod) — faithful WAI-Illustrious recipe clone. */
  ILLUSTRIOUS_RECIPE_CLONE = 'illustrious-recipe-clone',
  /** Comfy Runner (RunPod) — Anima Pencil-XL (Replicate has no live endpoint). */
  ANIMA_PENCIL_XL_RUNNER = 'anima-pencil-xl-runner',
  /** Comfy Runner (RunPod) — Pony Diffusion V6 XL, runner-only (no hosted endpoint). */
  PONY_DIFFUSION_V6 = 'pony-diffusion-v6',
  /** Comfy Runner (RunPod) — plain SDXL 1.0, faithful recipe clone path. */
  SDXL_10_RUNNER = 'sdxl-10-runner',

  // Audio models
  FISH_AUDIO_S2_PRO = 'fish-audio-s2-pro',
  ELEVENLABS_V3 = 'eleven-v3',
  ELEVENLABS_SFX_V2 = 'eleven-sfx-v2',

  // Video models
  HAPPYHORSE_10 = 'happyhorse-1.0',
  KLING_V3_PRO = 'kling-v3-pro',
  LTX_23 = 'ltx-2.3',
  SEEDANCE_20 = 'seedance-2.0',
  SEEDANCE_20_FAST = 'seedance-2.0-fast',
  /** Reference-to-video endpoint; supports voice cloning via audio_urls. */
  SEEDANCE_20_REFERENCE = 'seedance-2.0-reference',
  SEEDANCE_20_FAST_REFERENCE = 'seedance-2.0-fast-reference',
  /** Seedance 2.0 variants via VolcEngine (火山方舟) direct API — cn region. */
  SEEDANCE_20_VOLCENGINE = 'seedance-2.0-volcengine',
  SEEDANCE_20_FAST_VOLCENGINE = 'seedance-2.0-fast-volcengine',
  SEEDANCE_20_REFERENCE_VOLCENGINE = 'seedance-2.0-reference-volcengine',
  SEEDANCE_20_FAST_REFERENCE_VOLCENGINE = 'seedance-2.0-fast-reference-volcengine',
  VEO_31 = 'veo-3.1',

  // 3D models (image-to-3D)
  HUNYUAN3D_2_1 = 'hunyuan3d-2.1',
  HUNYUAN3D_V3 = 'hunyuan3d-v3',
  HUNYUAN3D_V31_PRO = 'hunyuan3d-v3.1-pro',
  TRELLIS_2 = 'trellis-2',
  TRIPOSR = 'triposr',
  RODIN_GEN_2_5 = 'rodin-gen-2.5',
}
