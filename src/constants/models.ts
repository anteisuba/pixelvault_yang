import type { OutputType } from '@/types'
import {
  AI_ADAPTER_TYPES,
  getDefaultProviderConfig,
  type ProviderConfig,
} from '@/constants/providers'

/**
 * AI Model definitions and configuration
 */

/** Supported AI model identifiers */
export enum AI_MODELS {
  // Image models
  SDXL = 'sdxl',
  ANIMAGINE_XL_4 = 'animagine-xl-4.0',
  GEMINI_FLASH_IMAGE = 'gemini-3.1-flash-image-preview',
  OPENAI_GPT_IMAGE_15 = 'gpt-image-1.5',
  FLUX_2_PRO = 'flux-2-pro',
  FLUX_2_DEV = 'flux-2-dev',
  FLUX_2_SCHNELL = 'flux-2-schnell',
  GEMINI_PRO_IMAGE = 'gemini-3.1-pro-image-preview',
  IDEOGRAM_3 = 'ideogram-3',
  RECRAFT_V3 = 'recraft-v3',
  SEEDREAM_45 = 'seedream-4.5',
  // Video models
  KLING_VIDEO = 'kling-video',
  KLING_V3_PRO = 'kling-v3-pro',
  MINIMAX_VIDEO = 'minimax-video',
  LUMA_RAY_2 = 'luma-ray-2',
  WAN_VIDEO = 'wan-video',
  HUNYUAN_VIDEO = 'hunyuan-video',
  SEEDANCE_PRO = 'seedance-pro',
  VEO_3 = 'veo-3',
  SORA_2 = 'sora-2',
  PIKA_V22 = 'pika-v2.2',
}

export const MODEL_MESSAGE_KEYS = {
  [AI_MODELS.SDXL]: 'sdxl',
  [AI_MODELS.ANIMAGINE_XL_4]: 'animagineXl4',
  [AI_MODELS.GEMINI_FLASH_IMAGE]: 'geminiFlashImage',
  [AI_MODELS.OPENAI_GPT_IMAGE_15]: 'openaiGptImage15',
  [AI_MODELS.FLUX_2_PRO]: 'flux2Pro',
  [AI_MODELS.FLUX_2_DEV]: 'flux2Dev',
  [AI_MODELS.FLUX_2_SCHNELL]: 'flux2Schnell',
  [AI_MODELS.GEMINI_PRO_IMAGE]: 'geminiProImage',
  [AI_MODELS.IDEOGRAM_3]: 'ideogram3',
  [AI_MODELS.RECRAFT_V3]: 'recraftV3',
  [AI_MODELS.SEEDREAM_45]: 'seedream45',
  [AI_MODELS.KLING_VIDEO]: 'klingVideo',
  [AI_MODELS.KLING_V3_PRO]: 'klingV3Pro',
  [AI_MODELS.MINIMAX_VIDEO]: 'minimaxVideo',
  [AI_MODELS.LUMA_RAY_2]: 'lumaRay2',
  [AI_MODELS.WAN_VIDEO]: 'wanVideo',
  [AI_MODELS.HUNYUAN_VIDEO]: 'hunyuanVideo',
  [AI_MODELS.SEEDANCE_PRO]: 'seedancePro',
  [AI_MODELS.VEO_3]: 'veo3',
  [AI_MODELS.SORA_2]: 'sora2',
  [AI_MODELS.PIKA_V22]: 'pikaV22',
} as const

/** Quality tier for video models */
export type QualityTier = 'budget' | 'standard' | 'premium'

/** Model-specific default parameters for video generation */
export interface VideoDefaults {
  negativePrompt?: string
  resolution?: string
  cfgScale?: number
  enablePromptOptimizer?: boolean
  generateAudio?: boolean
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
  /** Official documentation / API reference URL */
  officialUrl?: string
  /** Provider polling timeout in ms (video models need longer) */
  timeoutMs?: number
  /** Quality tier (video models) */
  qualityTier?: QualityTier
  /** Image-to-Video endpoint (when different from T2V endpoint) */
  i2vModelId?: string
  /** Model-specific default parameters for video */
  videoDefaults?: VideoDefaults
}

/** All model options with their configuration — ordered by quality ranking */
export const MODEL_OPTIONS: ModelOption[] = [
  // ═══ Image Models (ranked by 2026 quality) ═══════════════════════

  // #1 — Best instruction following, multimodal reasoning
  {
    id: AI_MODELS.OPENAI_GPT_IMAGE_15,
    cost: 3,
    adapterType: AI_ADAPTER_TYPES.OPENAI,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.OPENAI),
    externalModelId: AI_MODELS.OPENAI_GPT_IMAGE_15,
    outputType: 'IMAGE',
    available: true,
    officialUrl: 'https://platform.openai.com/docs/models#gpt-image',
  },
  // #2 — Advanced reasoning, up to 14 reference images
  {
    id: AI_MODELS.GEMINI_PRO_IMAGE,
    cost: 3,
    adapterType: AI_ADAPTER_TYPES.GEMINI,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.GEMINI),
    externalModelId: 'gemini-3.1-pro-image-preview',
    outputType: 'IMAGE',
    available: true,
    officialUrl: 'https://ai.google.dev/gemini-api/docs/models/gemini-v3',
  },
  // #3 — Top FLUX, multi-reference editing, character consistency
  {
    id: AI_MODELS.FLUX_2_PRO,
    cost: 2,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/flux-2-pro/v1.1',
    outputType: 'IMAGE',
    available: true,
    officialUrl: 'https://fal.ai/models/fal-ai/flux-2-pro',
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
    officialUrl: 'https://ai.google.dev/gemini-api/docs/image-generation',
  },
  // #8 — Developer-tier FLUX, good quality/price balance
  {
    id: AI_MODELS.FLUX_2_DEV,
    cost: 1,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/flux-2-dev',
    outputType: 'IMAGE',
    available: true,
    officialUrl: 'https://fal.ai/models/fal-ai/flux-2-dev',
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
  },
  // #10 — Anime specialist, best for anime/manga art
  {
    id: AI_MODELS.ANIMAGINE_XL_4,
    cost: 1,
    adapterType: AI_ADAPTER_TYPES.HUGGINGFACE,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.HUGGINGFACE),
    externalModelId: 'cagliostrolab/animagine-xl-4.0',
    outputType: 'IMAGE',
    available: true,
    officialUrl: 'https://huggingface.co/cagliostrolab/animagine-xl-4.0',
  },
  // #11 — Classic open-source baseline
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
  },

  // ═══ Video Models — Premium Tier ═════════════════════════════════

  // #1 — ELO 1248, cinematic multi-shot, native audio
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
  },
  // #2 — ELO 1222, native audio, 1080p, Google's best
  {
    id: AI_MODELS.VEO_3,
    cost: 8,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/veo3',
    outputType: 'VIDEO',
    available: true,
    officialUrl: 'https://fal.ai/models/fal-ai/veo3',
    timeoutMs: 300_000,
    qualityTier: 'premium',
    i2vModelId: 'fal-ai/veo3/image-to-video',
    videoDefaults: {
      resolution: '1080p',
      generateAudio: true,
    },
  },
  // #3 — OpenAI flagship video model
  {
    id: AI_MODELS.SORA_2,
    cost: 6,
    adapterType: AI_ADAPTER_TYPES.OPENAI,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.OPENAI),
    externalModelId: 'sora-2',
    outputType: 'VIDEO',
    available: true,
    officialUrl: 'https://platform.openai.com/docs/models/sora-2',
    timeoutMs: 300_000,
    qualityTier: 'premium',
    videoDefaults: {
      resolution: '720p',
    },
  },

  // ═══ Video Models — Standard Tier ════════════════════════════════

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
  // #5 — MiniMax Hailuo, good quality/price ratio
  {
    id: AI_MODELS.MINIMAX_VIDEO,
    cost: 3,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/minimax/hailuo-02',
    outputType: 'VIDEO',
    available: true,
    officialUrl: 'https://fal.ai/models/fal-ai/minimax/hailuo-02',
    timeoutMs: 180_000,
    qualityTier: 'standard',
    i2vModelId: 'fal-ai/minimax/hailuo-02/image-to-video',
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
  // #7 — Pika, creative effects & stylized video
  {
    id: AI_MODELS.PIKA_V22,
    cost: 3,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/pika/v2.2/text-to-video',
    outputType: 'VIDEO',
    available: true,
    officialUrl: 'https://fal.ai/models/fal-ai/pika/v2.2/text-to-video',
    timeoutMs: 180_000,
    qualityTier: 'standard',
    i2vModelId: 'fal-ai/pika/v2.2/image-to-video',
  },
  // #8 — Kling V2 Master, older but solid
  {
    id: AI_MODELS.KLING_VIDEO,
    cost: 5,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/kling-video/v2/master',
    outputType: 'VIDEO',
    available: true,
    officialUrl: 'https://fal.ai/models/fal-ai/kling-video/v2/master',
    timeoutMs: 300_000,
    qualityTier: 'standard',
    i2vModelId: 'fal-ai/kling-video/v2/master/image-to-video',
    videoDefaults: {
      negativePrompt: 'blur, distort, and low quality',
      cfgScale: 0.5,
    },
  },

  // ═══ Video Models — Budget Tier ══════════════════════════════════

  // #9 — Wan 2.2, best open-source option, price-efficient
  {
    id: AI_MODELS.WAN_VIDEO,
    cost: 2,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/wan/v2.2-a14b/text-to-video',
    outputType: 'VIDEO',
    available: true,
    officialUrl: 'https://fal.ai/models/fal-ai/wan/v2.2-a14b/text-to-video',
    timeoutMs: 180_000,
    qualityTier: 'budget',
    videoDefaults: {
      negativePrompt:
        'bright colors, overexposed, static, blurred details, subtitles, style, works, paintings, images, static, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, misshapen limbs, fused fingers, still picture, messy background, three legs, many people in the background, walking backwards',
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

/** Get the provider timeout for a model (defaults to 45s for images) */
export const getModelTimeout = (modelId: string): number =>
  getModelById(modelId)?.timeoutMs ?? 45_000
