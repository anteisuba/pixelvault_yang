import type { OutputType } from '@/types'
import {
  AI_ADAPTER_TYPES,
  getDefaultProviderConfig,
  type ProviderConfig,
} from '@/constants/providers'
import type { VideoResolution } from '@/constants/video-options'

/**
 * AI Model definitions and configuration
 */

/** Supported AI model identifiers */
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
  VEO_3 = 'veo-3',
  PIKA_V22 = 'pika-v2.2',
  RUNWAY_GEN3 = 'runway-gen3',
}

export const MODEL_MESSAGE_KEYS = {
  [AI_MODELS.SDXL]: 'sdxl',
  [AI_MODELS.ANIMAGINE_XL_4]: 'animagineXl4',
  [AI_MODELS.GEMINI_FLASH_IMAGE]: 'geminiFlashImage',
  [AI_MODELS.OPENAI_GPT_IMAGE_2]: 'openaiGptImage2',
  [AI_MODELS.FLUX_2_PRO]: 'flux2Pro',
  [AI_MODELS.FLUX_2_DEV]: 'flux2Dev',
  [AI_MODELS.FLUX_2_SCHNELL]: 'flux2Schnell',
  [AI_MODELS.FLUX_LORA]: 'fluxLora',
  [AI_MODELS.GEMINI_PRO_IMAGE]: 'geminiProImage',
  [AI_MODELS.IDEOGRAM_3]: 'ideogram3',
  [AI_MODELS.RECRAFT_V3]: 'recraftV3',
  [AI_MODELS.SEEDREAM_45]: 'seedream45',
  [AI_MODELS.SEEDREAM_50_LITE]: 'seedream50Lite',
  [AI_MODELS.SEEDREAM_40]: 'seedream40',
  [AI_MODELS.SEEDREAM_30]: 'seedream30',
  [AI_MODELS.SD_35_LARGE]: 'sd35Large',
  [AI_MODELS.NOVELAI_V45_FULL]: 'novelaiV45Full',
  [AI_MODELS.NOVELAI_V45_CURATED]: 'novelaiV45Curated',
  [AI_MODELS.ILLUSTRIOUS_XL]: 'illustriousXl',
  [AI_MODELS.NOVELAI_V4_FULL]: 'novelaiV4Full',
  [AI_MODELS.NOVELAI_V3]: 'novelaiV3',
  [AI_MODELS.GEMINI_25_FLASH_IMAGE]: 'gemini25FlashImage',
  [AI_MODELS.FLUX_2_MAX]: 'flux2Max',
  [AI_MODELS.RECRAFT_V4_PRO]: 'recraftV4Pro',
  [AI_MODELS.FLUX_KONTEXT_PRO]: 'fluxKontextPro',
  [AI_MODELS.FLUX_KONTEXT_MAX]: 'fluxKontextMax',
  [AI_MODELS.PLAYGROUND_V25]: 'playgroundV25',
  [AI_MODELS.FISH_AUDIO_S2_PRO]: 'fishAudioS2Pro',
  [AI_MODELS.FAL_F5_TTS]: 'falF5Tts',
  [AI_MODELS.KLING_VIDEO]: 'klingVideo',
  [AI_MODELS.KLING_V3_PRO]: 'klingV3Pro',
  [AI_MODELS.MINIMAX_VIDEO]: 'minimaxVideo',
  [AI_MODELS.LUMA_RAY_2]: 'lumaRay2',
  [AI_MODELS.WAN_VIDEO]: 'wanVideo',
  [AI_MODELS.HUNYUAN_VIDEO]: 'hunyuanVideo',
  [AI_MODELS.SEEDANCE_20]: 'seedance20',
  [AI_MODELS.SEEDANCE_20_FAST]: 'seedance20Fast',
  [AI_MODELS.SEEDANCE_20_VOLC]: 'seedance20Volc',
  [AI_MODELS.SEEDANCE_20_FAST_VOLC]: 'seedance20FastVolc',
  [AI_MODELS.SEEDANCE_PRO]: 'seedancePro',
  [AI_MODELS.SEEDANCE_15_PRO]: 'seedance15Pro',
  [AI_MODELS.SEEDANCE_10_PRO]: 'seedance10Pro',
  [AI_MODELS.VEO_3]: 'veo3',
  [AI_MODELS.PIKA_V22]: 'pikaV22',
  [AI_MODELS.RUNWAY_GEN3]: 'runwayGen3',
} as const

/** Quality tier for all models */
export type QualityTier = 'budget' | 'standard' | 'premium'

/** Style/use-case tag for model grouping */
export type StyleTag =
  | 'photorealistic'
  | 'anime'
  | 'design'
  | 'artistic'
  | 'general'

/** Model-specific default parameters for video generation */
export interface VideoDefaults {
  negativePrompt?: string
  resolution?: VideoResolution
  cfgScale?: number
  enablePromptOptimizer?: boolean
  generateAudio?: boolean
}

/** Video extension configuration for long video pipeline */
export interface VideoExtensionConfig {
  /** FAL extend endpoint ID (for native_extend method) */
  extendEndpointId?: string
  /** Extension method */
  extensionMethod: 'native_extend' | 'last_frame_chain'
  /** Duration per extension clip in seconds */
  extensionClipDuration: number
  /** Maximum total achievable duration in seconds */
  maxTotalDuration: number
}

/** Model option configuration */
export interface ModelOption {
  /** Unique model identifier (matches AI_MODELS enum) */
  id: AI_MODELS
  /** Credit cost per generation */
  cost: number
  /** Which adapter should be used */
  adapterType: AI_ADAPTER_TYPES
  /** Built-in provider configuration for the model */
  providerConfig: ProviderConfig
  /** Provider model identifier used for the external API call */
  externalModelId: string
  /** Output type */
  outputType: OutputType
  /** Whether the model is currently available for use */
  available: boolean
  /** Whether this model is available on the platform's free tier */
  freeTier?: boolean
  /** Official documentation / API reference URL */
  officialUrl?: string
  /** Provider polling timeout in ms (video models need longer) */
  timeoutMs?: number
  /** Quality tier */
  qualityTier?: QualityTier
  /** Style/use-case tag for grouping */
  styleTag?: StyleTag
  /** Image-to-Video endpoint (when different from T2V endpoint) */
  i2vModelId?: string
  /** Model-specific default parameters for video */
  videoDefaults?: VideoDefaults
  /** Whether this model supports LoRA adapters */
  supportsLora?: boolean
  /** Video extension capability for long video generation */
  videoExtension?: VideoExtensionConfig
  /** Whether this model requires at least one reference image to generate */
  requiresReferenceImage?: boolean
}

/** All model options with their configuration — ordered by quality ranking */
export const MODEL_OPTIONS: ModelOption[] = [
  // ═══ Image Models (ranked by 2026 quality) ═══════════════════════

  // #1 — OpenAI current flagship image model
  {
    id: AI_MODELS.OPENAI_GPT_IMAGE_2,
    cost: 3,
    adapterType: AI_ADAPTER_TYPES.OPENAI,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.OPENAI),
    externalModelId: AI_MODELS.OPENAI_GPT_IMAGE_2,
    outputType: 'IMAGE',
    available: true,
    officialUrl: 'https://developers.openai.com/api/docs/models/gpt-image-2',
    qualityTier: 'premium',
    styleTag: 'general',
  },
  // #2 — Advanced reasoning, up to 14 reference images
  {
    id: AI_MODELS.GEMINI_PRO_IMAGE,
    cost: 3,
    adapterType: AI_ADAPTER_TYPES.GEMINI,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.GEMINI),
    externalModelId: 'gemini-3-pro-image-preview',
    outputType: 'IMAGE',
    available: true,
    officialUrl: 'https://ai.google.dev/models/gemini',
    qualityTier: 'premium',
    styleTag: 'general',
  },
  // #3 — Top FLUX, multi-reference editing, character consistency
  {
    id: AI_MODELS.FLUX_2_PRO,
    cost: 2,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/flux-2-pro',
    outputType: 'IMAGE',
    available: true,
    officialUrl: 'https://fal.ai/models/fal-ai/flux-2-pro',
    qualityTier: 'premium',
    styleTag: 'photorealistic',
  },
  // #4 — Cinematic aesthetics, strong spatial understanding
  {
    id: AI_MODELS.SEEDREAM_45,
    cost: 2,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/bytedance/seedream/v4.5/text-to-image',
    outputType: 'IMAGE',
    available: true,
    officialUrl: 'https://seed.bytedance.com/en/seedream4_5',
    qualityTier: 'premium',
    styleTag: 'artistic',
  },
  // #4b — ByteDance latest lightweight model via VolcEngine direct
  {
    id: AI_MODELS.SEEDREAM_50_LITE,
    cost: 2,
    adapterType: AI_ADAPTER_TYPES.VOLCENGINE,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.VOLCENGINE),
    externalModelId: 'doubao-seedream-5-0-260128',
    outputType: 'IMAGE',
    available: true,
    officialUrl: 'https://www.volcengine.com/docs/82379/1541523',
    qualityTier: 'premium',
    styleTag: 'artistic',
  },
  // #4c — ByteDance mid-tier model via VolcEngine direct
  {
    id: AI_MODELS.SEEDREAM_40,
    cost: 2,
    adapterType: AI_ADAPTER_TYPES.VOLCENGINE,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.VOLCENGINE),
    externalModelId: 'doubao-seedream-4-0-250828',
    outputType: 'IMAGE',
    available: true,
    officialUrl: 'https://www.volcengine.com/docs/82379/1541523',
    qualityTier: 'standard',
    styleTag: 'artistic',
  },
  // #4d — ByteDance entry-level model via VolcEngine direct
  {
    id: AI_MODELS.SEEDREAM_30,
    cost: 1,
    adapterType: AI_ADAPTER_TYPES.VOLCENGINE,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.VOLCENGINE),
    externalModelId: 'doubao-seedream-3-0-t2i-250415',
    outputType: 'IMAGE',
    available: true,
    officialUrl: 'https://www.volcengine.com/docs/82379/1541523',
    qualityTier: 'budget',
    styleTag: 'artistic',
  },
  // #5 — Best text/typography handling, logos, posters
  {
    id: AI_MODELS.IDEOGRAM_3,
    cost: 2,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/ideogram/v3',
    outputType: 'IMAGE',
    available: true,
    officialUrl: 'https://developer.ideogram.ai/ideogram-api/api-overview',
    qualityTier: 'premium',
    styleTag: 'design',
  },
  // #6 — Designer-focused, superior composition & realism
  {
    id: AI_MODELS.RECRAFT_V3,
    cost: 2,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/recraft/v3/text-to-image',
    outputType: 'IMAGE',
    available: true,
    officialUrl: 'https://www.recraft.ai/docs/api-reference/getting-started',
    qualityTier: 'premium',
    styleTag: 'design',
  },
  // #7 — Fast + high quality, great for high-volume generation
  {
    id: AI_MODELS.GEMINI_FLASH_IMAGE,
    cost: 2,
    adapterType: AI_ADAPTER_TYPES.GEMINI,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.GEMINI),
    externalModelId: AI_MODELS.GEMINI_FLASH_IMAGE,
    outputType: 'IMAGE',
    available: true,
    freeTier: true,
    officialUrl: 'https://ai.google.dev/gemini-api/docs/image-generation',
    qualityTier: 'standard',
    styleTag: 'general',
  },
  // #8 — Developer-tier FLUX, good quality/price balance
  {
    id: AI_MODELS.FLUX_2_DEV,
    cost: 1,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/flux-2',
    outputType: 'IMAGE',
    available: true,
    officialUrl: 'https://fal.ai/models/fal-ai/flux-2',
    qualityTier: 'standard',
    styleTag: 'photorealistic',
    supportsLora: true,
  },
  // #9 — Fastest FLUX, ideal for previews and iteration
  {
    id: AI_MODELS.FLUX_2_SCHNELL,
    cost: 1,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/flux/schnell',
    outputType: 'IMAGE',
    available: true,
    officialUrl: 'https://fal.ai/models/fal-ai/flux/schnell',
    qualityTier: 'budget',
    styleTag: 'general',
  },
  // #9b — FLUX with LoRA support, use custom LoRAs for style/character control
  {
    id: AI_MODELS.FLUX_LORA,
    cost: 1,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/flux-lora',
    outputType: 'IMAGE',
    available: true,
    officialUrl: 'https://fal.ai/models/fal-ai/flux-lora',
    qualityTier: 'standard',
    styleTag: 'general',
    supportsLora: true,
  },
  // #9c — Illustrious XL: anime/illustration-specialized, huge LoRA ecosystem on Civitai
  {
    id: AI_MODELS.ILLUSTRIOUS_XL,
    cost: 2,
    adapterType: AI_ADAPTER_TYPES.REPLICATE,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.REPLICATE),
    externalModelId: 'delta-lock/noobai-xl',
    outputType: 'IMAGE',
    available: true,
    officialUrl: 'https://replicate.com/delta-lock/noobai-xl',
    qualityTier: 'standard',
    styleTag: 'anime',
    supportsLora: true,
  },
  // #10 — Open-source flagship, MMDiT architecture, 8B params
  {
    id: AI_MODELS.SD_35_LARGE,
    cost: 1,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/stable-diffusion-v35-large',
    outputType: 'IMAGE',
    available: true,
    officialUrl: 'https://fal.ai/models/fal-ai/stable-diffusion-v35-large',
    qualityTier: 'standard',
    styleTag: 'general',
  },
  // #11 — Anime specialist, best for anime/manga art
  {
    id: AI_MODELS.ANIMAGINE_XL_4,
    cost: 1,
    adapterType: AI_ADAPTER_TYPES.HUGGINGFACE,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.HUGGINGFACE),
    externalModelId: 'cagliostrolab/animagine-xl-4.0',
    outputType: 'IMAGE',
    available: true,
    officialUrl: 'https://huggingface.co/cagliostrolab/animagine-xl-4.0',
    qualityTier: 'standard',
    styleTag: 'anime',
  },
  // #12 — NovelAI V4.5 Full, latest anime-focused diffusion model
  {
    id: AI_MODELS.NOVELAI_V45_FULL,
    cost: 2,
    adapterType: AI_ADAPTER_TYPES.NOVELAI,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.NOVELAI),
    externalModelId: 'nai-diffusion-4-5-full',
    outputType: 'IMAGE',
    available: true,
    officialUrl: 'https://docs.novelai.net/en/image/models',
    qualityTier: 'premium',
    styleTag: 'anime',
  },
  // #13 — NovelAI V4.5 Curated, cleaner dataset, easier to steer
  {
    id: AI_MODELS.NOVELAI_V45_CURATED,
    cost: 2,
    adapterType: AI_ADAPTER_TYPES.NOVELAI,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.NOVELAI),
    externalModelId: 'nai-diffusion-4-5-curated',
    outputType: 'IMAGE',
    available: true,
    officialUrl: 'https://docs.novelai.net/en/image/models',
    qualityTier: 'premium',
    styleTag: 'anime',
  },
  // #14 — NovelAI V4 Full, previous-gen original model
  {
    id: AI_MODELS.NOVELAI_V4_FULL,
    cost: 1,
    adapterType: AI_ADAPTER_TYPES.NOVELAI,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.NOVELAI),
    externalModelId: 'nai-diffusion-4-full',
    outputType: 'IMAGE',
    available: true,
    officialUrl: 'https://docs.novelai.net/en/image/models',
    qualityTier: 'standard',
    styleTag: 'anime',
  },
  // #15 — NovelAI V3, SDXL-based anime model
  {
    id: AI_MODELS.NOVELAI_V3,
    cost: 1,
    adapterType: AI_ADAPTER_TYPES.NOVELAI,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.NOVELAI),
    externalModelId: 'nai-diffusion-3',
    outputType: 'IMAGE',
    available: true,
    officialUrl: 'https://docs.novelai.net/en/image/models',
    qualityTier: 'budget',
    styleTag: 'anime',
  },
  // #16 — Classic open-source baseline
  {
    id: AI_MODELS.SDXL,
    cost: 1,
    adapterType: AI_ADAPTER_TYPES.HUGGINGFACE,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.HUGGINGFACE),
    externalModelId: 'stabilityai/stable-diffusion-xl-base-1.0',
    outputType: 'IMAGE',
    available: true,
    officialUrl:
      'https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0',
    qualityTier: 'budget',
    styleTag: 'general',
  },
  // #17 — Aesthetic-focused, excels at portraits and artistic compositions
  {
    id: AI_MODELS.PLAYGROUND_V25,
    cost: 1,
    adapterType: AI_ADAPTER_TYPES.HUGGINGFACE,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.HUGGINGFACE),
    externalModelId: 'playgroundai/playground-v2.5-1024px-aesthetic',
    outputType: 'IMAGE',
    available: true,
    officialUrl:
      'https://huggingface.co/playgroundai/playground-v2.5-1024px-aesthetic',
    qualityTier: 'standard',
    styleTag: 'general',
  },

  // ═══ New Image Models (A2) ══════════════════════════════════════

  // Gemini 2.5 Flash Image — fast, cost-effective, text rendering
  {
    id: AI_MODELS.GEMINI_25_FLASH_IMAGE,
    cost: 1,
    adapterType: AI_ADAPTER_TYPES.GEMINI,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.GEMINI),
    externalModelId: 'gemini-2.5-flash-image',
    outputType: 'IMAGE',
    available: true,
    freeTier: true,
    officialUrl: 'https://ai.google.dev/gemini-api/docs/image-generation',
    qualityTier: 'standard',
    styleTag: 'general',
  },

  // FLUX 2 Max — highest quality FLUX model
  {
    id: AI_MODELS.FLUX_2_MAX,
    cost: 3,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/flux-2-max',
    outputType: 'IMAGE',
    available: true,
    officialUrl: 'https://fal.ai/models/fal-ai/flux-2-max',
    qualityTier: 'premium',
    styleTag: 'photorealistic',
  },

  // Recraft V4 Pro — design-focused, logos, vector-style
  {
    id: AI_MODELS.RECRAFT_V4_PRO,
    cost: 2,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/recraft/v4/pro/text-to-image',
    outputType: 'IMAGE',
    available: true,
    officialUrl: 'https://fal.ai/models/fal-ai/recraft/v4/pro/text-to-image',
    qualityTier: 'premium',
    styleTag: 'design',
  },

  // FLUX Kontext Pro — single reference image editing/generation
  {
    id: AI_MODELS.FLUX_KONTEXT_PRO,
    cost: 2,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/flux-pro/kontext',
    outputType: 'IMAGE',
    available: true,
    officialUrl: 'https://fal.ai/models/fal-ai/flux-pro/kontext',
    qualityTier: 'premium',
    styleTag: 'photorealistic',
    requiresReferenceImage: true,
  },

  // FLUX Kontext Max — multi-reference image editing/generation
  {
    id: AI_MODELS.FLUX_KONTEXT_MAX,
    cost: 3,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/flux-pro/kontext/max/multi',
    outputType: 'IMAGE',
    available: true,
    officialUrl: 'https://fal.ai/models/fal-ai/flux-pro/kontext/max',
    qualityTier: 'premium',
    styleTag: 'photorealistic',
    requiresReferenceImage: true,
  },

  // ═══ Video Models — Premium Tier ═════════════════════════════════

  // #1 — Kling 3.0 Pro, multi-shot storyboarding, native audio, 1080p
  {
    id: AI_MODELS.KLING_V3_PRO,
    cost: 6,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/kling-video/v3/pro/text-to-video',
    outputType: 'VIDEO',
    available: true,
    officialUrl:
      'https://fal.ai/models/fal-ai/kling-video/v3/pro/text-to-video',
    timeoutMs: 300_000,
    qualityTier: 'premium',
    i2vModelId: 'fal-ai/kling-video/v3/pro/image-to-video',
    videoDefaults: {
      negativePrompt: 'blur, distort, and low quality',
      cfgScale: 0.5,
      generateAudio: true,
    },
    videoExtension: {
      extendEndpointId: 'fal-ai/kling-video/v3/pro/extend-video',
      extensionMethod: 'native_extend',
      extensionClipDuration: 5,
      maxTotalDuration: 180,
    },
  },
  // #2 — Veo 3.1, Google's latest, 4K native audio
  {
    id: AI_MODELS.VEO_3,
    cost: 8,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/veo3.1',
    outputType: 'VIDEO',
    available: true,
    officialUrl: 'https://fal.ai/models/fal-ai/veo3.1',
    timeoutMs: 300_000,
    qualityTier: 'premium',
    i2vModelId: 'fal-ai/veo3.1/reference-to-video',
    videoDefaults: {
      resolution: '1080p',
      generateAudio: true,
    },
    videoExtension: {
      extendEndpointId: 'fal-ai/veo3.1/extend-video',
      extensionMethod: 'native_extend',
      extensionClipDuration: 7,
      maxTotalDuration: 148,
    },
  },

  // ═══ Video Models — Standard Tier ════════════════════════════════

  // #3.8 — ByteDance Seedance 2.0, latest gen with native audio + director-level camera
  {
    id: AI_MODELS.SEEDANCE_20,
    cost: 6,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'bytedance/seedance-2.0/text-to-video',
    outputType: 'VIDEO',
    available: true,
    officialUrl: 'https://fal.ai/models/bytedance/seedance-2.0/text-to-video',
    timeoutMs: 300_000,
    qualityTier: 'premium',
    i2vModelId: 'bytedance/seedance-2.0/image-to-video',
    videoDefaults: {
      generateAudio: true,
      resolution: '720p',
    },
  },
  // #3.9 — ByteDance Seedance 2.0 Fast, cheaper + faster variant
  {
    id: AI_MODELS.SEEDANCE_20_FAST,
    cost: 4,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'bytedance/seedance-2.0/fast/text-to-video',
    outputType: 'VIDEO',
    available: true,
    officialUrl:
      'https://fal.ai/models/bytedance/seedance-2.0/fast/text-to-video',
    timeoutMs: 300_000,
    qualityTier: 'standard',
    i2vModelId: 'bytedance/seedance-2.0/fast/image-to-video',
    videoDefaults: {
      generateAudio: true,
      resolution: '720p',
    },
  },
  // #3.8v — ByteDance Seedance 2.0 via VolcEngine, native audio + lipsync
  {
    id: AI_MODELS.SEEDANCE_20_VOLC,
    cost: 5,
    adapterType: AI_ADAPTER_TYPES.VOLCENGINE,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.VOLCENGINE),
    externalModelId: 'doubao-seedance-2-0-260128',
    outputType: 'VIDEO',
    available: true,
    officialUrl: 'https://www.volcengine.com/docs/82379/1520757',
    timeoutMs: 300_000,
    qualityTier: 'premium',
    videoDefaults: {
      generateAudio: true,
      resolution: '720p',
    },
  },
  // #3.9v — ByteDance Seedance 2.0 Fast via VolcEngine
  {
    id: AI_MODELS.SEEDANCE_20_FAST_VOLC,
    cost: 3,
    adapterType: AI_ADAPTER_TYPES.VOLCENGINE,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.VOLCENGINE),
    externalModelId: 'doubao-seedance-2-0-fast-260128',
    outputType: 'VIDEO',
    available: true,
    officialUrl: 'https://www.volcengine.com/docs/82379/1520757',
    timeoutMs: 300_000,
    qualityTier: 'standard',
    videoDefaults: {
      generateAudio: true,
      resolution: '720p',
    },
  },
  // #4 — ByteDance Seedance, strong ELO from Seed family
  {
    id: AI_MODELS.SEEDANCE_PRO,
    cost: 4,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/bytedance/seedance/v1/pro/text-to-video',
    outputType: 'VIDEO',
    available: true,
    officialUrl:
      'https://fal.ai/models/fal-ai/bytedance/seedance/v1/pro/text-to-video',
    timeoutMs: 300_000,
    qualityTier: 'standard',
    i2vModelId: 'fal-ai/bytedance/seedance/v1/pro/image-to-video',
  },
  // #4.5 — ByteDance Seedance 1.5 Pro via VolcEngine, native audio + first/last frame
  {
    id: AI_MODELS.SEEDANCE_15_PRO,
    cost: 5,
    adapterType: AI_ADAPTER_TYPES.VOLCENGINE,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.VOLCENGINE),
    externalModelId: 'doubao-seedance-1-5-pro-251215',
    outputType: 'VIDEO',
    available: true,
    officialUrl: 'https://www.volcengine.com/docs/82379/1520757',
    timeoutMs: 300_000,
    qualityTier: 'premium',
    videoDefaults: {
      generateAudio: true,
      resolution: '1080p',
    },
    videoExtension: {
      extensionMethod: 'last_frame_chain',
      extensionClipDuration: 10,
      maxTotalDuration: 120,
    },
  },
  // #4.6 — ByteDance Seedance 1.0 Pro via VolcEngine, first/last frame
  {
    id: AI_MODELS.SEEDANCE_10_PRO,
    cost: 4,
    adapterType: AI_ADAPTER_TYPES.VOLCENGINE,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.VOLCENGINE),
    externalModelId: 'doubao-seedance-1-0-pro-fast-251015',
    outputType: 'VIDEO',
    available: true,
    officialUrl: 'https://www.volcengine.com/docs/82379/1520757',
    timeoutMs: 300_000,
    qualityTier: 'standard',
    videoDefaults: {
      resolution: '720p',
    },
    videoExtension: {
      extensionMethod: 'last_frame_chain',
      extensionClipDuration: 8,
      maxTotalDuration: 80,
    },
  },
  // #5 — MiniMax Hailuo 2.3, improved realism & camera control
  {
    id: AI_MODELS.MINIMAX_VIDEO,
    cost: 3,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/minimax/hailuo-2.3/standard/text-to-video',
    outputType: 'VIDEO',
    available: true,
    officialUrl:
      'https://fal.ai/models/fal-ai/minimax/hailuo-2.3/standard/text-to-video',
    timeoutMs: 180_000,
    qualityTier: 'standard',
    i2vModelId: 'fal-ai/minimax/hailuo-2.3/standard/image-to-video',
    videoDefaults: {
      enablePromptOptimizer: true,
    },
  },
  // #6 — Luma Ray 2, realistic visuals & coherent motion
  {
    id: AI_MODELS.LUMA_RAY_2,
    cost: 4,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/luma-dream-machine/ray-2',
    outputType: 'VIDEO',
    available: true,
    officialUrl: 'https://fal.ai/models/fal-ai/luma-dream-machine/ray-2',
    timeoutMs: 120_000,
    qualityTier: 'standard',
    videoDefaults: {
      resolution: '720p',
    },
  },
  // #7 — Pika 2.5, sharper visuals & smoother motion
  {
    id: AI_MODELS.PIKA_V22,
    cost: 3,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/pika/v2.5/text-to-video',
    outputType: 'VIDEO',
    available: true,
    officialUrl: 'https://pika.art/api',
    timeoutMs: 180_000,
    qualityTier: 'standard',
    i2vModelId: 'fal-ai/pika/v2.5/image-to-video',
  },
  // #8 — Kling V2.1 Master, reliable cinematic quality
  {
    id: AI_MODELS.KLING_VIDEO,
    cost: 5,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/kling-video/v2.1/master/text-to-video',
    outputType: 'VIDEO',
    available: true,
    officialUrl:
      'https://fal.ai/models/fal-ai/kling-video/v2.1/master/text-to-video',
    timeoutMs: 300_000,
    qualityTier: 'standard',
    i2vModelId: 'fal-ai/kling-video/v2.1/master/image-to-video',
    videoDefaults: {
      negativePrompt: 'blur, distort, and low quality',
      cfgScale: 0.5,
    },
  },
  // #9 — Runway Gen-3, industry-standard cinematic video (I2V only on fal)
  {
    id: AI_MODELS.RUNWAY_GEN3,
    cost: 5,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/runway-gen3/turbo/image-to-video',
    outputType: 'VIDEO',
    available: true,
    officialUrl: 'https://runwayml.com/research/introducing-gen-3-alpha/',
    timeoutMs: 180_000,
    qualityTier: 'standard',
  },

  // ═══ Video Models — Budget Tier ══════════════════════════════════

  // #9 — Wan 2.6, multi-modal with native audio, up to 1080p
  {
    id: AI_MODELS.WAN_VIDEO,
    cost: 2,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'wan/v2.6/text-to-video',
    outputType: 'VIDEO',
    available: true,
    officialUrl: 'https://fal.ai/models/wan/v2.6/text-to-video',
    timeoutMs: 180_000,
    qualityTier: 'budget',
    i2vModelId: 'wan/v2.6/image-to-video',
    videoDefaults: {
      resolution: '720p',
    },
  },
  // #10 — HunyuanVideo, Tencent open-source, self-hostable
  {
    id: AI_MODELS.HUNYUAN_VIDEO,
    cost: 3,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/hunyuan-video',
    outputType: 'VIDEO',
    available: true,
    officialUrl: 'https://fal.ai/models/fal-ai/hunyuan-video',
    timeoutMs: 300_000,
    qualityTier: 'budget',
    i2vModelId: 'fal-ai/hunyuan-video-image-to-video',
    videoDefaults: {
      resolution: '720p',
    },
  },

  // ─── Audio Models ────────────────────────────────────────────────

  // #1 — Fish Audio S2 Pro, top-ranked TTS (81.88% win rate on EmergentTTS-Eval)
  {
    id: AI_MODELS.FISH_AUDIO_S2_PRO,
    cost: 2,
    adapterType: AI_ADAPTER_TYPES.FISH_AUDIO,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FISH_AUDIO),
    externalModelId: 's2-pro',
    outputType: 'AUDIO',
    available: true,
    officialUrl:
      'https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech',
    timeoutMs: 60_000,
    qualityTier: 'premium',
  },
  // #2 — FAL F5-TTS, open-source zero-shot voice cloning
  {
    id: AI_MODELS.FAL_F5_TTS,
    cost: 1,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/f5-tts',
    outputType: 'AUDIO',
    available: true,
    freeTier: true,
    officialUrl: 'https://fal.ai/models/fal-ai/f5-tts',
    timeoutMs: 120_000,
    qualityTier: 'standard',
  },
]

/**
 * Model family grouping — maps each model to its product family.
 * Used for leaderboard grouping and cross-version comparison.
 */
export const MODEL_FAMILIES: Record<string, string> = {
  // Image families
  [AI_MODELS.OPENAI_GPT_IMAGE_2]: 'GPT Image',
  [AI_MODELS.GEMINI_PRO_IMAGE]: 'Gemini',
  [AI_MODELS.GEMINI_FLASH_IMAGE]: 'Gemini',
  [AI_MODELS.FLUX_2_PRO]: 'FLUX',
  [AI_MODELS.FLUX_2_DEV]: 'FLUX',
  [AI_MODELS.FLUX_2_SCHNELL]: 'FLUX',
  [AI_MODELS.SEEDREAM_45]: 'Seedream',
  [AI_MODELS.SEEDREAM_50_LITE]: 'Seedream',
  [AI_MODELS.SEEDREAM_40]: 'Seedream',
  [AI_MODELS.SEEDREAM_30]: 'Seedream',
  [AI_MODELS.IDEOGRAM_3]: 'Ideogram',
  [AI_MODELS.RECRAFT_V3]: 'Recraft',
  [AI_MODELS.SD_35_LARGE]: 'Stable Diffusion',
  [AI_MODELS.SDXL]: 'Stable Diffusion',
  [AI_MODELS.ANIMAGINE_XL_4]: 'Stable Diffusion',
  [AI_MODELS.PLAYGROUND_V25]: 'Playground',
  [AI_MODELS.NOVELAI_V45_FULL]: 'NovelAI',
  [AI_MODELS.NOVELAI_V45_CURATED]: 'NovelAI',
  [AI_MODELS.ILLUSTRIOUS_XL]: 'Illustrious',
  [AI_MODELS.NOVELAI_V4_FULL]: 'NovelAI',
  [AI_MODELS.NOVELAI_V3]: 'NovelAI',
  [AI_MODELS.GEMINI_25_FLASH_IMAGE]: 'Gemini',
  [AI_MODELS.FLUX_2_MAX]: 'FLUX',
  [AI_MODELS.RECRAFT_V4_PRO]: 'Recraft',
  [AI_MODELS.FLUX_KONTEXT_PRO]: 'FLUX',
  [AI_MODELS.FLUX_KONTEXT_MAX]: 'FLUX',
  // Video families
  [AI_MODELS.KLING_V3_PRO]: 'Kling',
  [AI_MODELS.KLING_VIDEO]: 'Kling',
  [AI_MODELS.VEO_3]: 'Veo',
  [AI_MODELS.SEEDANCE_20]: 'Seedance',
  [AI_MODELS.SEEDANCE_20_FAST]: 'Seedance',
  [AI_MODELS.SEEDANCE_20_VOLC]: 'Seedance',
  [AI_MODELS.SEEDANCE_20_FAST_VOLC]: 'Seedance',
  [AI_MODELS.SEEDANCE_PRO]: 'Seedance',
  [AI_MODELS.SEEDANCE_15_PRO]: 'Seedance',
  [AI_MODELS.SEEDANCE_10_PRO]: 'Seedance',
  [AI_MODELS.MINIMAX_VIDEO]: 'MiniMax',
  [AI_MODELS.LUMA_RAY_2]: 'Luma',
  [AI_MODELS.PIKA_V22]: 'Pika',
  [AI_MODELS.WAN_VIDEO]: 'Wan',
  [AI_MODELS.HUNYUAN_VIDEO]: 'Hunyuan',
  [AI_MODELS.RUNWAY_GEN3]: 'Runway',
  // Audio families
  [AI_MODELS.FISH_AUDIO_S2_PRO]: 'Fish Audio',
  [AI_MODELS.FAL_F5_TTS]: 'F5-TTS',
}

/** Get the model family for a model ID */
export const getModelFamily = (modelId: string): string | null =>
  MODEL_FAMILIES[modelId] ?? null

/** Get unique model family names (ordered by first appearance) */
export const getModelFamilyList = (): string[] => [
  ...new Set(Object.values(MODEL_FAMILIES)),
]

/** Get only the currently available models */
export const getAvailableModels = (): ModelOption[] =>
  MODEL_OPTIONS.filter((model) => model.available)

/** Get a model option by its ID */
export const getModelById = (id: string): ModelOption | undefined =>
  MODEL_OPTIONS.find((model) => model.id === id)

export const getModelMessageKey = (
  id: AI_MODELS,
): (typeof MODEL_MESSAGE_KEYS)[AI_MODELS] => MODEL_MESSAGE_KEYS[id]

export const getExecutionModelId = (modelId: string): string =>
  getModelById(modelId)?.externalModelId ?? modelId

export const resolveAdapterType = (modelId: string): AI_ADAPTER_TYPES | null =>
  getModelById(modelId)?.adapterType ?? null

export const getBuiltInProviderConfig = (
  modelId: string,
): ProviderConfig | null => getModelById(modelId)?.providerConfig ?? null

export const isBuiltInModel = (value: string): value is AI_MODELS =>
  Object.values(AI_MODELS).includes(value as AI_MODELS)

export const isAiModel = isBuiltInModel

/** Get only the currently available video models */
export const getAvailableVideoModels = (): ModelOption[] =>
  MODEL_OPTIONS.filter(
    (model) => model.available && model.outputType === 'VIDEO',
  )

/** Get only the currently available image models */
export const getAvailableImageModels = (): ModelOption[] =>
  MODEL_OPTIONS.filter(
    (model) => model.available && model.outputType === 'IMAGE',
  )

/** Get only the currently available audio models */
export const getAvailableAudioModels = (): ModelOption[] =>
  MODEL_OPTIONS.filter(
    (model) => model.available && model.outputType === 'AUDIO',
  )

/** Get only the free tier models */
export const getFreeTierModels = (): ModelOption[] =>
  MODEL_OPTIONS.filter((model) => model.available && model.freeTier)

/** Check if a model is on the free tier */
export const isFreeTierModel = (modelId: string): boolean =>
  getModelById(modelId)?.freeTier === true

/** Provider group key for grouping models in UI */
export type ProviderGroup =
  | 'openai'
  | 'google'
  | 'novelai'
  | 'fal'
  | 'volcengine'
  | 'opensource'
  | 'replicate'
  | 'fish_audio'

/** Display order for provider groups */
export const PROVIDER_GROUP_ORDER: ProviderGroup[] = [
  'openai',
  'google',
  'novelai',
  'fal',
  'volcengine',
  'fish_audio',
  'opensource',
  'replicate',
]

/** Map adapter type to provider group */
export function getProviderGroup(adapterType: AI_ADAPTER_TYPES): ProviderGroup {
  switch (adapterType) {
    case AI_ADAPTER_TYPES.OPENAI:
      return 'openai'
    case AI_ADAPTER_TYPES.GEMINI:
      return 'google'
    case AI_ADAPTER_TYPES.NOVELAI:
      return 'novelai'
    case AI_ADAPTER_TYPES.FAL:
      return 'fal'
    case AI_ADAPTER_TYPES.VOLCENGINE:
      return 'volcengine'
    case AI_ADAPTER_TYPES.HUGGINGFACE:
      return 'opensource'
    case AI_ADAPTER_TYPES.REPLICATE:
      return 'replicate'
    case AI_ADAPTER_TYPES.FISH_AUDIO:
      return 'fish_audio'
  }
}

/** Group model options by provider, preserving order within each group */
export function groupModelsByProvider(
  models: ModelOption[],
): { group: ProviderGroup; models: ModelOption[] }[] {
  const grouped = new Map<ProviderGroup, ModelOption[]>()
  for (const model of models) {
    const group = getProviderGroup(model.adapterType)
    const list = grouped.get(group) ?? []
    list.push(model)
    grouped.set(group, list)
  }
  return PROVIDER_GROUP_ORDER.filter((group) => grouped.has(group)).map(
    (group) => ({ group, models: grouped.get(group)! }),
  )
}

/** Display order for style groups */
export const STYLE_GROUP_ORDER: StyleTag[] = [
  'photorealistic',
  'anime',
  'design',
  'artistic',
  'general',
]

/** Group model options by style tag, preserving order within each group */
export function groupModelsByStyle(
  models: ModelOption[],
): { group: StyleTag; models: ModelOption[] }[] {
  const grouped = new Map<StyleTag, ModelOption[]>()
  for (const model of models) {
    const tag = model.styleTag ?? 'general'
    const list = grouped.get(tag) ?? []
    list.push(model)
    grouped.set(tag, list)
  }
  return STYLE_GROUP_ORDER.filter((group) => grouped.has(group)).map(
    (group) => ({ group, models: grouped.get(group)! }),
  )
}

/** Get the provider timeout for a model (defaults to 45s for images) */
export const getModelTimeout = (modelId: string): number =>
  getModelById(modelId)?.timeoutMs ?? 45_000

/** Check if a model supports LoRA adapters */
export const modelSupportsLora = (modelId: string): boolean =>
  getModelById(modelId)?.supportsLora === true

/** Check if a model supports long video extension */
export const supportsLongVideo = (modelId: string): boolean =>
  getModelById(modelId)?.videoExtension != null

/** Get only the video models that support long video extension */
export const getLongVideoModels = (): ModelOption[] =>
  MODEL_OPTIONS.filter(
    (model) =>
      model.available && model.outputType === 'VIDEO' && model.videoExtension,
  )
