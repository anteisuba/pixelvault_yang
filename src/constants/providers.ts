import { AI_PROVIDER_ENDPOINTS } from '@/constants/config'

export enum AI_ADAPTER_TYPES {
  HUGGINGFACE = 'huggingface',
  GEMINI = 'gemini',
  OPENAI = 'openai',
  DEEPSEEK = 'deepseek',
  FAL = 'fal',
  RUNWAY = 'runway',
  REPLICATE = 'replicate',
  NOVELAI = 'novelai',
  VOLCENGINE = 'volcengine',
  FISH_AUDIO = 'fish_audio',
  HYPER3D_RODIN = 'hyper3d_rodin',
  DASHSCOPE = 'dashscope',
  ELEVENLABS = 'elevenlabs',
  /**
   * Self-hosted RunPod Serverless ComfyUI runner — faithful Civitai recipe
   * clones (checkpoint + LoRA stack) that hosted providers can't run. Not a
   * BYOK adapter: intentionally absent from `AI_ADAPTER_TYPE_OPTIONS` so it
   * never appears in the "Add API Key" picker. See
   * docs/plans/comfy-runner-HANDOFF-2026-07.md.
   */
  RUNNER = 'runner',
}

export interface ProviderConfig {
  label: string
  baseUrl: string
}

export const AI_ADAPTER_TYPE_OPTIONS = [
  AI_ADAPTER_TYPES.HUGGINGFACE,
  AI_ADAPTER_TYPES.GEMINI,
  AI_ADAPTER_TYPES.OPENAI,
  AI_ADAPTER_TYPES.DEEPSEEK,
  AI_ADAPTER_TYPES.FAL,
  AI_ADAPTER_TYPES.RUNWAY,
  AI_ADAPTER_TYPES.REPLICATE,
  AI_ADAPTER_TYPES.NOVELAI,
  AI_ADAPTER_TYPES.VOLCENGINE,
  AI_ADAPTER_TYPES.FISH_AUDIO,
  AI_ADAPTER_TYPES.HYPER3D_RODIN,
  AI_ADAPTER_TYPES.DASHSCOPE,
  AI_ADAPTER_TYPES.ELEVENLABS,
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
  [AI_ADAPTER_TYPES.DEEPSEEK]: {
    label: 'DeepSeek',
    baseUrl: AI_PROVIDER_ENDPOINTS.DEEPSEEK,
  },
  [AI_ADAPTER_TYPES.FAL]: {
    label: 'fal.ai',
    baseUrl: AI_PROVIDER_ENDPOINTS.FAL,
  },
  [AI_ADAPTER_TYPES.RUNWAY]: {
    label: 'Runway',
    baseUrl: AI_PROVIDER_ENDPOINTS.RUNWAY,
  },
  [AI_ADAPTER_TYPES.REPLICATE]: {
    label: 'Replicate',
    baseUrl: AI_PROVIDER_ENDPOINTS.REPLICATE,
  },
  [AI_ADAPTER_TYPES.NOVELAI]: {
    label: 'NovelAI',
    baseUrl: AI_PROVIDER_ENDPOINTS.NOVELAI,
  },
  [AI_ADAPTER_TYPES.VOLCENGINE]: {
    label: 'VolcEngine',
    baseUrl: AI_PROVIDER_ENDPOINTS.VOLCENGINE,
  },
  [AI_ADAPTER_TYPES.FISH_AUDIO]: {
    label: 'Fish Audio',
    baseUrl: AI_PROVIDER_ENDPOINTS.FISH_AUDIO,
  },
  [AI_ADAPTER_TYPES.HYPER3D_RODIN]: {
    label: 'Hyper3D Rodin',
    baseUrl: AI_PROVIDER_ENDPOINTS.HYPER3D,
  },
  [AI_ADAPTER_TYPES.DASHSCOPE]: {
    label: 'Qwen',
    baseUrl: AI_PROVIDER_ENDPOINTS.DASHSCOPE,
  },
  [AI_ADAPTER_TYPES.ELEVENLABS]: {
    label: 'ElevenLabs',
    baseUrl: AI_PROVIDER_ENDPOINTS.ELEVENLABS,
  },
  [AI_ADAPTER_TYPES.RUNNER]: {
    label: 'PixelVault Runner',
    baseUrl: AI_PROVIDER_ENDPOINTS.RUNPOD,
  },
}

export const ADAPTER_KEY_HINTS: Record<AI_ADAPTER_TYPES, string> = {
  [AI_ADAPTER_TYPES.HUGGINGFACE]: 'hf_...',
  [AI_ADAPTER_TYPES.GEMINI]: 'AIza...',
  [AI_ADAPTER_TYPES.OPENAI]: 'sk-proj-...',
  [AI_ADAPTER_TYPES.DEEPSEEK]: 'sk-...',
  [AI_ADAPTER_TYPES.FAL]: 'fal_...',
  [AI_ADAPTER_TYPES.RUNWAY]: 'key_...',
  [AI_ADAPTER_TYPES.REPLICATE]: 'r8_...',
  [AI_ADAPTER_TYPES.NOVELAI]: 'pst-...',
  [AI_ADAPTER_TYPES.VOLCENGINE]: 'ark-...',
  [AI_ADAPTER_TYPES.FISH_AUDIO]: 'aaf42ad8...',
  [AI_ADAPTER_TYPES.HYPER3D_RODIN]: 'sk-...',
  [AI_ADAPTER_TYPES.DASHSCOPE]: 'sk-...',
  [AI_ADAPTER_TYPES.ELEVENLABS]: 'sk_...',
  // Platform-managed only — never entered by a user (no BYOK UI slot).
  [AI_ADAPTER_TYPES.RUNNER]: 'n/a (platform-managed)',
}

export const ADAPTER_DEFAULT_COSTS: Record<AI_ADAPTER_TYPES, number> = {
  [AI_ADAPTER_TYPES.HUGGINGFACE]: 1,
  [AI_ADAPTER_TYPES.GEMINI]: 2,
  [AI_ADAPTER_TYPES.OPENAI]: 3,
  [AI_ADAPTER_TYPES.DEEPSEEK]: 2,
  [AI_ADAPTER_TYPES.FAL]: 2,
  [AI_ADAPTER_TYPES.RUNWAY]: 5,
  [AI_ADAPTER_TYPES.REPLICATE]: 2,
  [AI_ADAPTER_TYPES.NOVELAI]: 2,
  [AI_ADAPTER_TYPES.VOLCENGINE]: 4,
  [AI_ADAPTER_TYPES.FISH_AUDIO]: 2,
  [AI_ADAPTER_TYPES.HYPER3D_RODIN]: 3,
  [AI_ADAPTER_TYPES.DASHSCOPE]: 2,
  [AI_ADAPTER_TYPES.ELEVENLABS]: 5,
  // Faithful recipe clone — heavier than a plain hosted call (cold-start
  // aware), priced closer to the premium tier.
  [AI_ADAPTER_TYPES.RUNNER]: 3,
}

export const ADAPTER_CUSTOM_MODEL_EXAMPLES: Record<AI_ADAPTER_TYPES, string> = {
  [AI_ADAPTER_TYPES.HUGGINGFACE]: 'black-forest-labs/FLUX.1-schnell',
  [AI_ADAPTER_TYPES.GEMINI]: 'gemini-3.1-flash-image-preview',
  [AI_ADAPTER_TYPES.OPENAI]: 'gpt-image-2',
  [AI_ADAPTER_TYPES.DEEPSEEK]: 'deepseek-v4-pro',
  [AI_ADAPTER_TYPES.FAL]: 'fal-ai/flux-2-pro',
  [AI_ADAPTER_TYPES.RUNWAY]: 'gen4.5',
  [AI_ADAPTER_TYPES.REPLICATE]: 'ideogram-ai/ideogram-v2',
  [AI_ADAPTER_TYPES.NOVELAI]: 'nai-diffusion-4-5-full',
  [AI_ADAPTER_TYPES.VOLCENGINE]: 'doubao-seedream-5-0-260128',
  [AI_ADAPTER_TYPES.FISH_AUDIO]: 's2-pro',
  [AI_ADAPTER_TYPES.HYPER3D_RODIN]: 'rodin-gen-2.5',
  [AI_ADAPTER_TYPES.DASHSCOPE]: 'qwen-plus',
  [AI_ADAPTER_TYPES.ELEVENLABS]: 'eleven_v3',
  [AI_ADAPTER_TYPES.RUNNER]: 'waiIllustriousSDXL_v150',
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
  [AI_ADAPTER_TYPES.DEEPSEEK]: {
    url: 'https://platform.deepseek.com/api_keys',
    steps: 'Sign in → API Keys → Create API key',
  },
  [AI_ADAPTER_TYPES.FAL]: {
    url: 'https://fal.ai/dashboard/keys',
    steps: 'Sign in → Dashboard → Keys → Create key',
  },
  [AI_ADAPTER_TYPES.RUNWAY]: {
    url: 'https://dev.runwayml.com',
    steps: 'Sign in → Dev Portal → API Keys → Create key',
  },
  [AI_ADAPTER_TYPES.REPLICATE]: {
    url: 'https://replicate.com/account/api-tokens',
    steps: 'Sign in → Account → API tokens → Create token',
  },
  [AI_ADAPTER_TYPES.NOVELAI]: {
    url: 'https://novelai.net/',
    steps: 'Sign in → User Settings → Account → Get Persistent API Token',
  },
  [AI_ADAPTER_TYPES.VOLCENGINE]: {
    url: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey',
    steps:
      'Sign in → 火山方舟控制台 → API Key 管理 → Create API Key. 模型需要创建推理接入点 (endpoint), 将 endpoint ID (ep-xxx) 作为自定义模型 ID 使用。',
  },
  [AI_ADAPTER_TYPES.FISH_AUDIO]: {
    url: 'https://fish.audio/zh-CN/app/api-keys/',
    steps: 'Sign in → 开发者 → API 密钥 → 创建新的密钥',
  },
  [AI_ADAPTER_TYPES.HYPER3D_RODIN]: {
    url: 'https://hyper3d.ai/dashboard',
    steps:
      'Sign in → Dashboard → API Keys → Create key. Business subscription ($120/mo) required for Rodin Gen-2.5.',
  },
  [AI_ADAPTER_TYPES.DASHSCOPE]: {
    url: 'https://dashscope.console.aliyun.com/apiKey',
    steps:
      'Sign in (Singapore / International account) → DashScope Console → API-KEY → Create new API key (sk-...). Use the Singapore region — keys are region-locked.',
  },
  [AI_ADAPTER_TYPES.ELEVENLABS]: {
    url: 'https://elevenlabs.io/app/settings/api-keys',
    steps: 'Sign in → Settings → API Keys → Create API Key (sk_...).',
  },
  [AI_ADAPTER_TYPES.RUNNER]: {
    url: 'https://docs.runpod.io/serverless/overview',
    steps:
      'Platform-managed RunPod Serverless endpoint — owner-only, configured via server secrets. Not user-configurable.',
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

/**
 * Provider fallback mapping for platform-key (free tier) generation.
 * Only used when the primary provider fails with a transient error (5xx/timeout)
 * and the user is on free tier (not BYOK — can't fallback without their key).
 *
 * Maps: failed model → fallback model that uses a different provider.
 * Fallback should be same output type and similar quality tier.
 */
export const PROVIDER_FALLBACK_MAP: Partial<Record<string, string>> = {
  // Image model fallbacks (cross-provider)
  // Pro is currently capacity-constrained (frequent 503); fall back to
  // the more reliable Flash before crossing providers.
  'gemini-3-pro-image-preview': 'gemini-3.1-flash-image',
  'gemini-3.1-flash-image-preview': 'gpt-image-2',
  'gemini-3.1-flash-image': 'gpt-image-2',
  'gpt-image-2': 'gemini-3.1-flash-image',
  'flux-2-pro': 'gemini-3.1-flash-image',
  'flux-2-flash': 'gemini-3.1-flash-image',
  'ideogram-3': 'gemini-3.1-flash-image',
  'recraft-v4-pro': 'gemini-3.1-flash-image',
}
