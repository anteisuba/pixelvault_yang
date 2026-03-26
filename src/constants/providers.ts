import { AI_PROVIDER_ENDPOINTS } from '@/constants/config'

export enum AI_ADAPTER_TYPES {
  HUGGINGFACE = 'huggingface',
  GEMINI = 'gemini',
  OPENAI = 'openai',
  FAL = 'fal',
  REPLICATE = 'replicate',
  NOVELAI = 'novelai',
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
  AI_ADAPTER_TYPES.NOVELAI,
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
  [AI_ADAPTER_TYPES.NOVELAI]: {
    label: 'NovelAI',
    baseUrl: AI_PROVIDER_ENDPOINTS.NOVELAI,
  },
}

export const ADAPTER_KEY_HINTS: Record<AI_ADAPTER_TYPES, string> = {
  [AI_ADAPTER_TYPES.HUGGINGFACE]: 'hf_...',
  [AI_ADAPTER_TYPES.GEMINI]: 'AIza...',
  [AI_ADAPTER_TYPES.OPENAI]: 'sk-proj-...',
  [AI_ADAPTER_TYPES.FAL]: 'fal_...',
  [AI_ADAPTER_TYPES.REPLICATE]: 'r8_...',
  [AI_ADAPTER_TYPES.NOVELAI]: 'pst-...',
}

export const ADAPTER_DEFAULT_COSTS: Record<AI_ADAPTER_TYPES, number> = {
  [AI_ADAPTER_TYPES.HUGGINGFACE]: 1,
  [AI_ADAPTER_TYPES.GEMINI]: 2,
  [AI_ADAPTER_TYPES.OPENAI]: 3,
  [AI_ADAPTER_TYPES.FAL]: 2,
  [AI_ADAPTER_TYPES.REPLICATE]: 2,
  [AI_ADAPTER_TYPES.NOVELAI]: 2,
}

export const ADAPTER_CUSTOM_MODEL_EXAMPLES: Record<AI_ADAPTER_TYPES, string> = {
  [AI_ADAPTER_TYPES.HUGGINGFACE]: 'black-forest-labs/FLUX.1-schnell',
  [AI_ADAPTER_TYPES.GEMINI]: 'gemini-3.1-flash-image-preview',
  [AI_ADAPTER_TYPES.OPENAI]: 'gpt-image-1.5',
  [AI_ADAPTER_TYPES.FAL]: 'fal-ai/flux-2-pro',
  [AI_ADAPTER_TYPES.REPLICATE]: 'ideogram-ai/ideogram-v2',
  [AI_ADAPTER_TYPES.NOVELAI]: 'nai-diffusion-4-5-full',
}

export const getDefaultProviderConfig = (
  adapterType: AI_ADAPTER_TYPES,
): ProviderConfig => DEFAULT_PROVIDER_CONFIGS[adapterType]

export const getProviderLabel = (providerConfig: ProviderConfig): string =>
  providerConfig.label

export const getAdapterKeyHint = (adapterType: AI_ADAPTER_TYPES): string =>
  ADAPTER_KEY_HINTS[adapterType]

export const getAdapterDefaultCost = (adapterType: AI_ADAPTER_TYPES): number =>
  ADAPTER_DEFAULT_COSTS[adapterType]

export interface ProviderGuide {
  url: string
  steps: string
}

export const ADAPTER_API_GUIDES: Record<AI_ADAPTER_TYPES, ProviderGuide> = {
  [AI_ADAPTER_TYPES.HUGGINGFACE]: {
    url: 'https://huggingface.co/settings/tokens',
    steps: 'Sign in → Settings → Access Tokens → New token (Read)',
  },
  [AI_ADAPTER_TYPES.GEMINI]: {
    url: 'https://aistudio.google.com/apikey',
    steps: 'Sign in → Get API key → Create API key',
  },
  [AI_ADAPTER_TYPES.OPENAI]: {
    url: 'https://platform.openai.com/api-keys',
    steps: 'Sign in → API keys → Create new secret key',
  },
  [AI_ADAPTER_TYPES.FAL]: {
    url: 'https://fal.ai/dashboard/keys',
    steps: 'Sign in → Dashboard → Keys → Create key',
  },
  [AI_ADAPTER_TYPES.REPLICATE]: {
    url: 'https://replicate.com/account/api-tokens',
    steps: 'Sign in → Account → API tokens → Create token',
  },
  [AI_ADAPTER_TYPES.NOVELAI]: {
    url: 'https://novelai.net/',
    steps: 'Sign in → User Settings → Account → Get Persistent API Token',
  },
}

export const getAdapterApiGuide = (
  adapterType: AI_ADAPTER_TYPES,
): ProviderGuide => ADAPTER_API_GUIDES[adapterType]

export const getAdapterCustomModelExample = (
  adapterType: AI_ADAPTER_TYPES,
): string => ADAPTER_CUSTOM_MODEL_EXAMPLES[adapterType]

export const isAiAdapterType = (value: string): value is AI_ADAPTER_TYPES =>
  Object.values(AI_ADAPTER_TYPES).includes(value as AI_ADAPTER_TYPES)
