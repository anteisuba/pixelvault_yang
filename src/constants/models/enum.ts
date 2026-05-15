/**
 * Supported AI model identifiers — single source of truth for every place
 * the platform references a built-in model. Keep entries alphabetised
 * within each section and update the corresponding option file under
 * `src/constants/models/{image,video,audio}.ts` plus i18n (en/ja/zh) when
 * adding or removing a model.
 */
export enum AI_MODELS {
  // Image models
  SDXL = 'sdxl',
  ANIMAGINE_XL_4 = 'animagine-xl-4.0',
  GEMINI_FLASH_IMAGE = 'gemini-3.1-flash-image-preview',
  OPENAI_GPT_IMAGE_2 = 'gpt-image-2',
  FLUX_2_PRO = 'flux-2-pro',
  FLUX_2_DEV = 'flux-2-dev',
  FLUX_2_SCHNELL = 'flux-2-schnell',
  FLUX_LORA = 'flux-lora',
  GEMINI_PRO_IMAGE = 'gemini-3-pro-image-preview',
  IDEOGRAM_3 = 'ideogram-3',
  RECRAFT_V3 = 'recraft-v3',
  SEEDREAM_45 = 'seedream-4.5',
  SEEDREAM_50_LITE = 'seedream-5.0-lite',
  SEEDREAM_40 = 'seedream-4.0',
  SEEDREAM_30 = 'seedream-3.0',
  SD_35_LARGE = 'sd-3.5-large',
  NOVELAI_V45_FULL = 'nai-diffusion-4-5-full',
  NOVELAI_V45_CURATED = 'nai-diffusion-4-5-curated',
  ILLUSTRIOUS_XL = 'illustrious-xl',
  NOVELAI_V4_FULL = 'nai-diffusion-4-full',
  NOVELAI_V3 = 'nai-diffusion-3',
  GEMINI_25_FLASH_IMAGE = 'gemini-2.5-flash-image',
  FLUX_2_MAX = 'flux-2-max',
  RECRAFT_V4_PRO = 'recraft-v4-pro',
  FLUX_KONTEXT_PRO = 'flux-kontext-pro',
  FLUX_KONTEXT_MAX = 'flux-kontext-max',
  PLAYGROUND_V25 = 'playground-v2.5',
  // Audio models
  FISH_AUDIO_S2_PRO = 'fish-audio-s2-pro',
  FAL_F5_TTS = 'fal-f5-tts',
  // Video models
  KLING_VIDEO = 'kling-video',
  KLING_V3_PRO = 'kling-v3-pro',
  MINIMAX_VIDEO = 'minimax-video',
  LUMA_RAY_2 = 'luma-ray-2',
  WAN_VIDEO = 'wan-video',
  HUNYUAN_VIDEO = 'hunyuan-video',
  SEEDANCE_20 = 'seedance-2.0',
  SEEDANCE_20_FAST = 'seedance-2.0-fast',
  SEEDANCE_20_VOLC = 'seedance-2.0-volc',
  SEEDANCE_20_FAST_VOLC = 'seedance-2.0-fast-volc',
  SEEDANCE_PRO = 'seedance-pro',
  SEEDANCE_15_PRO = 'seedance-1.5-pro',
  SEEDANCE_10_PRO = 'seedance-1.0-pro',
  VEO_31 = 'veo-3.1',
  PIKA_V25 = 'pika-v2.5',
  RUNWAY_GEN3 = 'runway-gen3',
  // 3D models (image-to-3D)
  HUNYUAN3D_2_1 = 'hunyuan3d-2.1',
  HUNYUAN3D_V3 = 'hunyuan3d-v3',
  HUNYUAN3D_V31_PRO = 'hunyuan3d-v3.1-pro',
  TRELLIS_2 = 'trellis-2',
  TRIPOSR = 'triposr',
}
