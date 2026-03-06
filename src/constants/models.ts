import type { OutputType } from '@/types'

/**
 * AI Model definitions and configuration
 */

/** Supported AI model identifiers */
export enum AI_MODELS {
  SDXL = 'sdxl',
  ANIMAGINE_XL_4 = 'animagine-xl-4.0',
  GEMINI_FLASH_IMAGE = 'gemini-3.1-flash-image-preview',
}

/** Hugging Face model repository IDs */
export const HF_MODEL_IDS: Record<string, string> = {
  [AI_MODELS.SDXL]: 'stabilityai/stable-diffusion-xl-base-1.0',
  [AI_MODELS.ANIMAGINE_XL_4]: 'cagliostrolab/animagine-xl-4.0',
}

/** Model option configuration */
export interface ModelOption {
  /** Unique model identifier (matches AI_MODELS enum) */
  id: AI_MODELS
  /** Display label */
  label: string
  /** Credit cost per generation */
  cost: number
  /** AI provider name */
  provider: string
  /** Output type */
  outputType: OutputType
  /** Short description of the model */
  description: string
  /** Whether the model is currently available for use */
  available: boolean
}

/** All model options with their configuration */
export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: AI_MODELS.SDXL,
    label: 'Stable Diffusion XL',
    cost: 1,
    provider: 'HuggingFace',
    outputType: 'IMAGE',
    description: 'High-resolution image generation with excellent detail',
    available: true,
  },
  {
    id: AI_MODELS.ANIMAGINE_XL_4,
    label: 'Animagine XL 4.0',
    cost: 1,
    provider: 'HuggingFace',
    outputType: 'IMAGE',
    description: 'High-quality anime-style image generation',
    available: true,
  },
  {
    id: AI_MODELS.GEMINI_FLASH_IMAGE,
    label: 'Gemini 3.1 Flash Image',
    cost: 2,
    provider: 'Gemini',
    outputType: 'IMAGE',
    description: "Google's state-of-the-art image generation model",
    available: true,
  },
]

/** Get only the currently available models */
export const getAvailableModels = (): ModelOption[] =>
  MODEL_OPTIONS.filter((model) => model.available)

/** Get a model option by its ID */
export const getModelById = (id: AI_MODELS): ModelOption | undefined =>
  MODEL_OPTIONS.find((model) => model.id === id)
