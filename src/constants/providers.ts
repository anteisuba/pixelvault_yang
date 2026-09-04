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
  /** BytePlus ModelArk international station; accounts and keys are separate from VolcEngine China. */
  BYTEPLUS = 'byteplus',
  FISH_AUDIO = 'fish_audio',
  HYPER3D_RODIN = 'hyper3d_rodin',
  DASHSCOPE = 'dashscope',
  ELEVENLABS = 'elevenlabs',
  /**
   * MiniMax (Hailuo) — 国际站 api.minimax.io. Video-only route today
   * (MiniMax-H3). Native direct is **half the price of the same model on
   * fal** ($0.13 vs $0.26 per 2K second) — see docs/references/model-pricing.md.
   */
  MINIMAX = 'minimax',
  /**
   * MiniMax 国内站 api.minimaxi.com（域名多一个 `i`）. A separate adapter type
   * rather than a config flag because the two stations are **fully separate**:
   * accounts are registered independently and **API keys are not
   * interchangeable** — a CN key rejected against the global host and vice
   * versa. Key storage is keyed by adapterType, so one type per station.
   */
  MINIMAX_CN = 'minimax_cn',
  /**
   * Claude (Anthropic Messages API) — BYOK, text-only. Fable 5.1 is the only
   * model on this route (owner 2026-09-02, replacing the 07-26 Sonnet 5
   * decree): structural
   * reasoning (multi-scene continuity, character arcs, shot planning) for
   * the canvas assistant. See
   * docs/references/pages/assistant-shell.md.
   */
  ANTHROPIC = 'anthropic',
  /**
   * xAI (Grok) — BYOK, text-only. grok-4.6 is the only model on this route
   * (owner 2026-08-23 decree): 500k context, vision, function calling +
   * structured outputs + reasoning, at $2/$6 per MTok — half the output price
   * of gpt-5.6-terra. Officially OpenAI-REST-compatible, so it reuses the
   * DeepSeek-style chat path rather than needing its own adapter file.
   * ⚠ Pricing doubles above a 200k-token context ($4/$12).
   */
  XAI = 'xai',
  /**
   * Self-hosted RunPod Serverless ComfyUI runner — faithful Civitai recipe
   * clones (checkpoint + LoRA stack) that hosted providers can't run. Not a
   * BYOK adapter: intentionally absent from `AI_ADAPTER_TYPE_OPTIONS` so it
   * never appears in the "Add API Key" picker. See
   * docs/references/domains/runner.md.
   */
  RUNNER = 'runner',
}

export interface ProviderConfig {
  label: string
  baseUrl: string
  /** Required by Anthropic identity-linked keys that are not scoped to one workspace. */
  anthropicWorkspaceId?: string
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
  AI_ADAPTER_TYPES.BYTEPLUS,
  AI_ADAPTER_TYPES.FISH_AUDIO,
  AI_ADAPTER_TYPES.HYPER3D_RODIN,
  AI_ADAPTER_TYPES.DASHSCOPE,
  AI_ADAPTER_TYPES.ELEVENLABS,
  AI_ADAPTER_TYPES.MINIMAX,
  AI_ADAPTER_TYPES.MINIMAX_CN,
  AI_ADAPTER_TYPES.ANTHROPIC,
  AI_ADAPTER_TYPES.XAI,
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
  [AI_ADAPTER_TYPES.BYTEPLUS]: {
    label: 'BytePlus',
    baseUrl: AI_PROVIDER_ENDPOINTS.BYTEPLUS,
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
  // Two stations, two entries — see the MINIMAX_CN enum comment for why they
  // can't share one. Labels stay ASCII brand names (same convention as
  // 'VolcEngine' / 'Qwen') so the picker doesn't need i18n plumbing.
  [AI_ADAPTER_TYPES.MINIMAX]: {
    label: 'MiniMax',
    baseUrl: AI_PROVIDER_ENDPOINTS.MINIMAX,
  },
  [AI_ADAPTER_TYPES.MINIMAX_CN]: {
    label: 'MiniMax (CN)',
    baseUrl: AI_PROVIDER_ENDPOINTS.MINIMAX_CN,
  },
  // 'Claude' not 'Anthropic': the selector shows the model-family name to
  // users, matching the existing 'Qwen' (not 'DashScope') convention.
  [AI_ADAPTER_TYPES.ANTHROPIC]: {
    label: 'Claude',
    baseUrl: AI_PROVIDER_ENDPOINTS.ANTHROPIC,
  },
  // 'Grok' not 'xAI': same model-family-name convention as 'Claude' (not
  // 'Anthropic') and 'Qwen' (not 'DashScope').
  [AI_ADAPTER_TYPES.XAI]: {
    label: 'Grok',
    baseUrl: AI_PROVIDER_ENDPOINTS.XAI,
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
  [AI_ADAPTER_TYPES.BYTEPLUS]: 'ark-...',
  [AI_ADAPTER_TYPES.FISH_AUDIO]: 'aaf42ad8...',
  [AI_ADAPTER_TYPES.HYPER3D_RODIN]: 'sk-...',
  [AI_ADAPTER_TYPES.DASHSCOPE]: 'sk-...',
  [AI_ADAPTER_TYPES.ELEVENLABS]: 'sk_...',
  // MiniMax issues long JWT-shaped keys on both stations.
  [AI_ADAPTER_TYPES.MINIMAX]: 'eyJhbGci...',
  [AI_ADAPTER_TYPES.MINIMAX_CN]: 'eyJhbGci...',
  [AI_ADAPTER_TYPES.ANTHROPIC]: 'sk-ant-...',
  // ⚠ xAI's docs never state a key prefix (only `<YOUR_XAI_API_KEY_HERE>`
  // placeholders). This is the console's observed format, kept as a display
  // hint only — validate-api-key.ts deliberately has no xAI prefix rule, so a
  // key that doesn't match still saves. Real validation is verifyAdapterKey.
  [AI_ADAPTER_TYPES.XAI]: 'xai-...',
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
  [AI_ADAPTER_TYPES.BYTEPLUS]: 4,
  [AI_ADAPTER_TYPES.FISH_AUDIO]: 2,
  [AI_ADAPTER_TYPES.HYPER3D_RODIN]: 3,
  [AI_ADAPTER_TYPES.DASHSCOPE]: 2,
  [AI_ADAPTER_TYPES.ELEVENLABS]: 5,
  // 2K-only video at $0.13/s native — between the Seedance fast tier (4) and
  // the premium video tier (6).
  [AI_ADAPTER_TYPES.MINIMAX]: 5,
  [AI_ADAPTER_TYPES.MINIMAX_CN]: 5,
  // Same tier as OPENAI — both premium-priced text/reasoning routes.
  [AI_ADAPTER_TYPES.ANTHROPIC]: 3,
  // grok-4.6 is $2/$6 per MTok — cheaper than every other flagship text route
  // here (gpt-5.6-sol $4/$20, terra $2/$12, Fable 5.1 $10/$50), so it sits in
  // the cheap text tier with Gemini/DeepSeek rather than the premium one.
  [AI_ADAPTER_TYPES.XAI]: 2,
  // Faithful recipe clone — heavier than a plain hosted call (cold-start
  // aware), priced closer to the premium tier.
  [AI_ADAPTER_TYPES.RUNNER]: 3,
}

export const ADAPTER_CUSTOM_MODEL_EXAMPLES: Record<AI_ADAPTER_TYPES, string> = {
  [AI_ADAPTER_TYPES.HUGGINGFACE]: 'black-forest-labs/FLUX.1-schnell',
  [AI_ADAPTER_TYPES.GEMINI]: 'gemini-3.1-flash-image',
  [AI_ADAPTER_TYPES.OPENAI]: 'gpt-image-2',
  [AI_ADAPTER_TYPES.DEEPSEEK]: 'deepseek-v4-pro',
  [AI_ADAPTER_TYPES.FAL]: 'fal-ai/flux-2-pro',
  [AI_ADAPTER_TYPES.RUNWAY]: 'gen4.5',
  [AI_ADAPTER_TYPES.REPLICATE]: 'ideogram-ai/ideogram-v2',
  [AI_ADAPTER_TYPES.NOVELAI]: 'nai-diffusion-5-full',
  [AI_ADAPTER_TYPES.VOLCENGINE]: 'doubao-seedream-5-0-260128',
  [AI_ADAPTER_TYPES.BYTEPLUS]: 'dreamina-seedance-2-0-260128',
  [AI_ADAPTER_TYPES.FISH_AUDIO]: 's2-pro',
  [AI_ADAPTER_TYPES.HYPER3D_RODIN]: 'rodin-gen-2.5',
  [AI_ADAPTER_TYPES.DASHSCOPE]: 'qwen-plus',
  [AI_ADAPTER_TYPES.ELEVENLABS]: 'eleven_v3',
  [AI_ADAPTER_TYPES.MINIMAX]: 'MiniMax-H3',
  [AI_ADAPTER_TYPES.MINIMAX_CN]: 'MiniMax-H3',
  [AI_ADAPTER_TYPES.ANTHROPIC]: 'claude-fable-5-1',
  [AI_ADAPTER_TYPES.XAI]: 'grok-4.6',
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
  [AI_ADAPTER_TYPES.BYTEPLUS]: {
    url: 'https://docs.byteplus.com/en/docs/ModelArk/1520757',
    steps:
      'Sign in to BytePlus ModelArk → API Key management → Create API Key. BytePlus keys are not interchangeable with VolcEngine China keys.',
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
  [AI_ADAPTER_TYPES.MINIMAX]: {
    url: 'https://platform.minimax.io/user-center/basic-information/interface-key',
    steps:
      'Sign in (global station) → 用户中心 → 接口密钥 → 创建密钥. ⚠ 国际站与国内站账号独立、密钥不通用——本条目只接受 api.minimax.io 的密钥。',
  },
  [AI_ADAPTER_TYPES.MINIMAX_CN]: {
    url: 'https://platform.minimaxi.com/user-center/basic-information/interface-key',
    steps:
      'Sign in (国内站 minimaxi.com，域名多一个 i) → 用户中心 → 接口密钥 → 创建密钥. ⚠ 国内站密钥打国际站地址会被拒，反之亦然。',
  },
  [AI_ADAPTER_TYPES.ANTHROPIC]: {
    url: 'https://console.anthropic.com/settings/keys',
    steps: 'Sign in → Settings → API Keys → Create Key (sk-ant-...).',
  },
  [AI_ADAPTER_TYPES.XAI]: {
    url: 'https://console.x.ai/team/default/api-keys',
    steps: 'Sign in → Console → API Keys → Create API key.',
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
