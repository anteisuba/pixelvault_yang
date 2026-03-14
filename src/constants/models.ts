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
  SDXL = 'sdxl',
  ANIMAGINE_XL_4 = 'animagine-xl-4.0',
  GEMINI_FLASH_IMAGE = 'gemini-3.1-flash-image-preview',
}

export const MODEL_MESSAGE_KEYS = {
  [AI_MODELS.SDXL]: 'sdxl',
  [AI_MODELS.ANIMAGINE_XL_4]: 'animagineXl4',
  [AI_MODELS.GEMINI_FLASH_IMAGE]: 'geminiFlashImage',
} as const

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
