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
  /** FLUX.2 Pro multi-reference edit endpoint (image_urls + prompt). */
  FLUX_2_PRO_EDIT = 'flux-2-pro-edit',
  FLUX_2_FLASH = 'flux-2-flash',
  FLUX_LORA = 'flux-lora',
  GEMINI_PRO_IMAGE = 'gemini-3-pro-image-preview',
  IDEOGRAM_3 = 'ideogram-3',
  SEEDREAM_45 = 'seedream-4.5',
  /** Seedream 4.5 via VolcEngine (火山方舟) direct API — cn region. */
  SEEDREAM_45_VOLCENGINE = 'seedream-4.5-volcengine',
  /** Seedream 5.0 Pro — flagship successor to 4.5 (fal, no `fal-ai/` prefix). */
  SEEDREAM_50_PRO = 'seedream-5.0-pro',
  /** Seedream 5.0 Lite — value tier with web-search-grounded prompts. */
  SEEDREAM_50_LITE = 'seedream-5.0-lite',
  /**
   * Seedream 5.0 **base** via VolcEngine (火山方舟) direct API — cn region.
   * ⚠ This is `doubao-seedream-5-0-260128`, NOT the Pro tier. It is the id
   * that carries 组图生成 (group/multi-image output); the Pro below does not.
   */
  SEEDREAM_50_VOLCENGINE = 'seedream-5.0-volcengine',
  /**
   * Seedream 5.0 **Pro** via VolcEngine — the native counterpart to the
   * fal-routed SEEDREAM_50_PRO, which fal resells at ~1.6× ($0.0675 vs 火山's
   * 0.30 元 ≈ $0.042 for the same ≤236万像素 tier; fal's 1536² boundary and
   * 火山's 236万像素 are the same 2.36M-pixel line).
   *
   * ⚠ Not a superset of the base entry above — Pro does 单图生成 only and
   * drops 组图生成, so both ids stay in the catalog.
   */
  SEEDREAM_50_PRO_VOLCENGINE = 'seedream-5.0-pro-volcengine',
  /**
   * Seedream 5.0 Lite via VolcEngine — native counterpart to the fal-routed
   * SEEDREAM_50_LITE above. fal resells the same model at $0.035/image against
   * 火山's 0.22 元 (~$0.031), so the direct line is the cheaper one.
   * See docs/references/model-pricing.md.
   */
  SEEDREAM_50_LITE_VOLCENGINE = 'seedream-5.0-lite-volcengine',
  /** Nano Banana 2 Lite — ultra-low-latency Gemini image tier. */
  GEMINI_FLASH_LITE_IMAGE = 'gemini-3.1-flash-lite-image',
  NOVELAI_V45_FULL = 'nai-diffusion-4-5-full',
  NOVELAI_V45_CURATED = 'nai-diffusion-4-5-curated',
  NOVELAI_V5_FULL = 'nai-diffusion-5-full',
  NOVELAI_V5_CURATED = 'nai-diffusion-5-curated',
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
  /** Comfy Runner (RunPod) — Anima (Cosmos-Predict2 DiT), its own Qwen-Image workflow. */
  ANIMA_DIT_RUNNER = 'anima-dit-runner',

  // Audio models
  /**
   * Catalog key kept as fish-audio-s2-pro for DB/i18n stability. Execution id
   * is `s2.1-pro` (Fish production recommendation as of 2026-07).
   */
  FISH_AUDIO_S2_PRO = 'fish-audio-s2-pro',
  ELEVENLABS_V3 = 'eleven-v3',
  ELEVENLABS_SFX_V2 = 'eleven-sfx-v2',
  /** ElevenLabs Music v2 — text-to-music (audioKind=music). */
  ELEVENLABS_MUSIC_V2 = 'eleven-music-v2',

  // Video models
  HAPPYHORSE_10 = 'happyhorse-1.0',
  /**
   * Wan 3.0 via fal — Alibaba's Tongyi Wanxiang line, **not** a HappyHorse
   * successor. The two are separate Alibaba product lines (fal lists them as
   * distinct model families); adding Wan does not retire HappyHorse.
   *
   * Base = text-to-video + image-to-video (first frame, optional last frame).
   * `_REFERENCE` = the multimodal reference endpoint (images + video + audio +
   * document + webpage), same split as the Seedance pair.
   */
  WAN_30 = 'wan-3.0',
  WAN_30_REFERENCE = 'wan-3.0-reference',
  KLING_V3_PRO = 'kling-v3-pro',
  /** Kling VIDEO 3.0 Omni Pro — element/video reference heavy workflows. */
  KLING_O3_PRO = 'kling-o3-pro',
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
  /** Seedance 2.0 variants via BytePlus ModelArk — international station. */
  SEEDANCE_20_BYTEPLUS = 'seedance-2.0-byteplus',
  SEEDANCE_20_FAST_BYTEPLUS = 'seedance-2.0-fast-byteplus',
  SEEDANCE_20_REFERENCE_BYTEPLUS = 'seedance-2.0-reference-byteplus',
  SEEDANCE_20_FAST_REFERENCE_BYTEPLUS = 'seedance-2.0-fast-reference-byteplus',
  VEO_31 = 'veo-3.1',
  /**
   * Gemini Omni Flash — video via the Interactions API, not generateContent.
   * Enum value deliberately omits `-preview`: the execution id carries it, so
   * the GA promotion becomes a one-line externalModelId change (see the
   * gemini-3-pro-image-preview shutdown for why this matters).
   */
  GEMINI_OMNI_FLASH = 'gemini-omni-flash',
  /**
   * MiniMax H3 (Hailuo successor) via MiniMax's own API. Two stations because
   * accounts and keys are not interchangeable between minimax.io (global) and
   * minimaxi.com (CN) — see the MINIMAX_CN adapter-type comment.
   *
   * Base = text/first-frame/last-frame; `_REFERENCE` = the multimodal
   * reference face (images + motion video + voice audio). Both hit the same
   * execution id `MiniMax-H3`; only the `content` array differs, exactly like
   * the Seedance VolcEngine variants.
   */
  /** Seedance 2.5 via fal.ai, VolcEngine China, and BytePlus international. */
  SEEDANCE_25 = 'seedance-2.5',
  SEEDANCE_25_REFERENCE = 'seedance-2.5-reference',
  SEEDANCE_25_VOLCENGINE = 'seedance-2.5-volcengine',
  SEEDANCE_25_REFERENCE_VOLCENGINE = 'seedance-2.5-reference-volcengine',
  SEEDANCE_25_BYTEPLUS = 'seedance-2.5-byteplus',
  SEEDANCE_25_REFERENCE_BYTEPLUS = 'seedance-2.5-reference-byteplus',
  MINIMAX_H3 = 'minimax-h3',
  MINIMAX_H3_REFERENCE = 'minimax-h3-reference',
  MINIMAX_H3_CN = 'minimax-h3-cn',
  MINIMAX_H3_REFERENCE_CN = 'minimax-h3-reference-cn',

  // 3D models (image-to-3D)
  HUNYUAN3D_2_1 = 'hunyuan3d-2.1',
  HUNYUAN3D_V3 = 'hunyuan3d-v3',
  HUNYUAN3D_V31_PRO = 'hunyuan3d-v3.1-pro',
  TRELLIS_2 = 'trellis-2',
  TRIPOSR = 'triposr',
  RODIN_GEN_2_5 = 'rodin-gen-2.5',
}
