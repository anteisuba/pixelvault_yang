import { AI_PROVIDER_ENDPOINTS } from '@/constants/config'

export enum AI_ADAPTER_TYPES {
  HUGGINGFACE = 'huggingface',
  GEMINI = 'gemini',
  OPENAI = 'openai',
  FAL = 'fal',
  REPLICATE = 'replicate',
}

export interface ProviderConfig {
  label: string
  baseUrl: string
}

export const AI_ADAPTER_TYPE_OPTIONS = [
  AI_ADAPTER_TYPES.HUGGINGFACE,
  AI_ADAPTER_TYPES.GEMINI,
  AI_ADAPTER_TYPES.OPENAI,
  AI_ADAPTER_TYPES.FAL,
  AI_ADAPTER_TYPES.REPLICATE,
] as const

export const DEFAULT_PROVIDER_CONFIGS: Record<
  AI_ADAPTER_TYPES,
  ProviderConfig
> = {
  [AI_ADAPTER_TYPES.HUGGINGFACE]: {
    label: 'HuggingFace',
    baseUrl: AI_PROVIDER_ENDPOINTS.HUGGINGFACE,
  },
  [AI_ADAPTER_TYPES.GEMINI]: {
    label: 'Gemini',
    baseUrl: AI_PROVIDER_ENDPOINTS.GEMINI,
  },
  [AI_ADAPTER_TYPES.OPENAI]: {
    label: 'OpenAI',
    baseUrl: AI_PROVIDER_ENDPOINTS.OPENAI,
  },
  [AI_ADAPTER_TYPES.FAL]: {
    label: 'fal.ai',
    baseUrl: AI_PROVIDER_ENDPOINTS.FAL,
  },
  [AI_ADAPTER_TYPES.REPLICATE]: {
    label: 'Replicate',
    baseUrl: AI_PROVIDER_ENDPOINTS.REPLICATE,
  },
}

export const ADAPTER_ENV_FALLBACKS: Record<AI_ADAPTER_TYPES, string> = {
  [AI_ADAPTER_TYPES.HUGGINGFACE]: 'HF_API_TOKEN',
  [AI_ADAPTER_TYPES.GEMINI]: 'SILICONFLOW_API_KEY',
  [AI_ADAPTER_TYPES.OPENAI]: 'OPENAI_API_KEY',
  [AI_ADAPTER_TYPES.FAL]: 'FAL_KEY',
  [AI_ADAPTER_TYPES.REPLICATE]: 'REPLICATE_API_TOKEN',
}

export const ADAPTER_KEY_HINTS: Record<AI_ADAPTER_TYPES, string> = {
  [AI_ADAPTER_TYPES.HUGGINGFACE]: 'hf_...',
  [AI_ADAPTER_TYPES.GEMINI]: 'AIza...',
  [AI_ADAPTER_TYPES.OPENAI]: 'sk-proj-...',
  [AI_ADAPTER_TYPES.FAL]: 'fal_...',
  [AI_ADAPTER_TYPES.REPLICATE]: 'r8_...',
}

export const ADAPTER_DEFAULT_COSTS: Record<AI_ADAPTER_TYPES, number> = {
  [AI_ADAPTER_TYPES.HUGGINGFACE]: 1,
  [AI_ADAPTER_TYPES.GEMINI]: 2,
  [AI_ADAPTER_TYPES.OPENAI]: 3,
  [AI_ADAPTER_TYPES.FAL]: 2,
  [AI_ADAPTER_TYPES.REPLICATE]: 2,
}

export const ADAPTER_CUSTOM_MODEL_EXAMPLES: Record<AI_ADAPTER_TYPES, string> = {
  [AI_ADAPTER_TYPES.HUGGINGFACE]: 'black-forest-labs/FLUX.1-schnell',
  [AI_ADAPTER_TYPES.GEMINI]: 'gemini-2.0-flash-exp-image-generation',
  [AI_ADAPTER_TYPES.OPENAI]: 'gpt-image-1.5',
  [AI_ADAPTER_TYPES.FAL]: 'fal-ai/flux-2-pro',
  [AI_ADAPTER_TYPES.REPLICATE]: 'ideogram-ai/ideogram-v2',
}

export const getDefaultProviderConfig = (
  adapterType: AI_ADAPTER_TYPES,
): ProviderConfig => DEFAULT_PROVIDER_CONFIGS[adapterType]

export const getProviderLabel = (providerConfig: ProviderConfig): string =>
  providerConfig.label

export const getAdapterEnvFallback = (adapterType: AI_ADAPTER_TYPES): string =>
  ADAPTER_ENV_FALLBACKS[adapterType]

export const getAdapterKeyHint = (adapterType: AI_ADAPTER_TYPES): string =>
  ADAPTER_KEY_HINTS[adapterType]

export const getAdapterDefaultCost = (adapterType: AI_ADAPTER_TYPES): number =>
  ADAPTER_DEFAULT_COSTS[adapterType]

export const getAdapterCustomModelExample = (
  adapterType: AI_ADAPTER_TYPES,
): string => ADAPTER_CUSTOM_MODEL_EXAMPLES[adapterType]

export const isAiAdapterType = (value: string): value is AI_ADAPTER_TYPES =>
  Object.values(AI_ADAPTER_TYPES).includes(value as AI_ADAPTER_TYPES)
