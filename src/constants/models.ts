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
  GEMINI_PRO_IMAGE = 'gemini-3-pro-image',
  IDEOGRAM_2 = 'ideogram-2',
  // Video models
  KLING_VIDEO = 'kling-video',
  KLING_V3_PRO = 'kling-v3-pro',
  MINIMAX_VIDEO = 'minimax-video',
  LUMA_RAY_2 = 'luma-ray-2',
  WAN_VIDEO = 'wan-video',
  HUNYUAN_VIDEO = 'hunyuan-video',
  SEEDANCE_PRO = 'seedance-pro',
  VEO_3 = 'veo-3',
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
  [AI_MODELS.IDEOGRAM_2]: 'ideogram2',
  [AI_MODELS.KLING_VIDEO]: 'klingVideo',
  [AI_MODELS.KLING_V3_PRO]: 'klingV3Pro',
  [AI_MODELS.MINIMAX_VIDEO]: 'minimaxVideo',
  [AI_MODELS.LUMA_RAY_2]: 'lumaRay2',
  [AI_MODELS.WAN_VIDEO]: 'wanVideo',
  [AI_MODELS.HUNYUAN_VIDEO]: 'hunyuanVideo',
  [AI_MODELS.SEEDANCE_PRO]: 'seedancePro',
  [AI_MODELS.VEO_3]: 'veo3',
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
  /** Provider polling timeout in ms (video models need longer) */
  timeoutMs?: number
  /** Quality tier (video models) */
  qualityTier?: QualityTier
  /** Image-to-Video endpoint (when different from T2V endpoint) */
  i2vModelId?: string
  /** Model-specific default parameters for video */
  videoDefaults?: VideoDefaults
}

/** All model options with their configuration */
export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: AI_MODELS.SDXL,
    cost: 1,
    adapterType: AI_ADAPTER_TYPES.HUGGINGFACE,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.HUGGINGFACE),
    externalModelId: 'stabilityai/stable-diffusion-xl-base-1.0',
    outputType: 'IMAGE',
    available: true,
  },
  {
    id: AI_MODELS.ANIMAGINE_XL_4,
    cost: 1,
    adapterType: AI_ADAPTER_TYPES.HUGGINGFACE,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.HUGGINGFACE),
    externalModelId: 'cagliostrolab/animagine-xl-4.0',
    outputType: 'IMAGE',
    available: true,
  },
  {
    id: AI_MODELS.GEMINI_FLASH_IMAGE,
    cost: 2,
    adapterType: AI_ADAPTER_TYPES.GEMINI,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.GEMINI),
    externalModelId: AI_MODELS.GEMINI_FLASH_IMAGE,
    outputType: 'IMAGE',
    available: true,
  },
  {
    id: AI_MODELS.OPENAI_GPT_IMAGE_15,
    cost: 3,
    adapterType: AI_ADAPTER_TYPES.OPENAI,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.OPENAI),
    externalModelId: AI_MODELS.OPENAI_GPT_IMAGE_15,
    outputType: 'IMAGE',
    available: true,
  },
  {
    id: AI_MODELS.FLUX_2_PRO,
    cost: 2,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/flux-2-pro/v1.1',
    outputType: 'IMAGE',
    available: true,
  },
  {
    id: AI_MODELS.FLUX_2_DEV,
    cost: 1,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/flux-2-dev',
    outputType: 'IMAGE',
    available: true,
  },
  {
    id: AI_MODELS.FLUX_2_SCHNELL,
    cost: 1,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/flux-2-schnell',
    outputType: 'IMAGE',
    available: true,
  },
  {
    id: AI_MODELS.GEMINI_PRO_IMAGE,
    cost: 3,
    adapterType: AI_ADAPTER_TYPES.GEMINI,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.GEMINI),
    externalModelId: 'gemini-3-pro-image',
    outputType: 'IMAGE',
    available: true,
  },
  {
    id: AI_MODELS.IDEOGRAM_2,
    cost: 2,
    adapterType: AI_ADAPTER_TYPES.REPLICATE,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.REPLICATE),
    externalModelId: 'ideogram-ai/ideogram-v2',
    outputType: 'IMAGE',
    available: true,
  },
  // ─── Video models (Premium) ─────────────────────────────────────
  {
    id: AI_MODELS.VEO_3,
    cost: 8,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/veo3',
    outputType: 'VIDEO',
    available: true,
    timeoutMs: 300_000,
    qualityTier: 'premium',
    i2vModelId: 'fal-ai/veo3/image-to-video',
    videoDefaults: {
      resolution: '1080p',
      generateAudio: true,
    },
  },
  {
    id: AI_MODELS.KLING_V3_PRO,
    cost: 6,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/kling-video/v3/pro/text-to-video',
    outputType: 'VIDEO',
    available: true,
    timeoutMs: 300_000,
    qualityTier: 'premium',
    i2vModelId: 'fal-ai/kling-video/v3/pro/image-to-video',
    videoDefaults: {
      negativePrompt: 'blur, distort, and low quality',
      cfgScale: 0.5,
      generateAudio: true,
    },
  },
  // ─── Video models (Standard) ──────────────────────────────────
  {
    id: AI_MODELS.SEEDANCE_PRO,
    cost: 4,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/bytedance/seedance/v1/pro/text-to-video',
    outputType: 'VIDEO',
    available: true,
    timeoutMs: 300_000,
    qualityTier: 'standard',
    i2vModelId: 'fal-ai/bytedance/seedance/v1/pro/image-to-video',
  },
  {
    id: AI_MODELS.KLING_VIDEO,
    cost: 5,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/kling-video/v2/master',
    outputType: 'VIDEO',
    available: true,
    timeoutMs: 300_000,
    qualityTier: 'standard',
    i2vModelId: 'fal-ai/kling-video/v2/master/image-to-video',
    videoDefaults: {
      negativePrompt: 'blur, distort, and low quality',
      cfgScale: 0.5,
    },
  },
  {
    id: AI_MODELS.MINIMAX_VIDEO,
    cost: 3,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/minimax-video/video-01',
    outputType: 'VIDEO',
    available: true,
    timeoutMs: 180_000,
    qualityTier: 'standard',
    i2vModelId: 'fal-ai/minimax-video/video-01/image-to-video',
    videoDefaults: {
      enablePromptOptimizer: true,
    },
  },
  {
    id: AI_MODELS.LUMA_RAY_2,
    cost: 4,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/luma-dream-machine/ray-2',
    outputType: 'VIDEO',
    available: true,
    timeoutMs: 120_000,
    qualityTier: 'standard',
    videoDefaults: {
      resolution: '720p',
    },
  },
  // ─── Video models (Budget) ────────────────────────────────────
  {
    id: AI_MODELS.WAN_VIDEO,
    cost: 2,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/wan/v2.1/1.3b',
    outputType: 'VIDEO',
    available: true,
    timeoutMs: 180_000,
    qualityTier: 'budget',
    videoDefaults: {
      negativePrompt:
        'bright colors, overexposed, static, blurred details, subtitles, style, works, paintings, images, static, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, misshapen limbs, fused fingers, still picture, messy background, three legs, many people in the background, walking backwards',
      resolution: '720p',
    },
  },
  {
    id: AI_MODELS.HUNYUAN_VIDEO,
    cost: 3,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/hunyuan-video',
    outputType: 'VIDEO',
    available: true,
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
