import {
  AI_ADAPTER_TYPES,
  getDefaultProviderConfig,
} from '@/constants/providers'
import { AI_MODELS } from '@/constants/models/enum'
import type { ModelOption } from '@/constants/models/types'

/**
 * Video generation models — tiered by quality + cost so the picker can
 * group them when the user filters by output type.
 */
export const VIDEO_MODEL_OPTIONS: ModelOption[] = [
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
    id: AI_MODELS.VEO_31,
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
  // #2.5 — Vidu Q3 Pro, latest API-accessible Vidu with audio-video output
  {
    id: AI_MODELS.VIDU_Q3_PRO,
    cost: 6,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/vidu/q3/text-to-video',
    outputType: 'VIDEO',
    available: true,
    officialUrl: 'https://fal.ai/models/fal-ai/vidu/q3/text-to-video',
    timeoutMs: 300_000,
    qualityTier: 'premium',
    i2vModelId: 'fal-ai/vidu/q3/image-to-video',
    videoDefaults: {
      resolution: '720p',
      generateAudio: true,
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
    available: false,
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
    available: false,
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
    available: false,
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
    id: AI_MODELS.PIKA_V25,
    cost: 3,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/pika/v2.5/text-to-video',
    outputType: 'VIDEO',
    available: false,
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
    available: false,
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
  // #9 — Runway Gen-4.5, current flagship video model
  {
    id: AI_MODELS.RUNWAY_GEN45,
    cost: 8,
    adapterType: AI_ADAPTER_TYPES.RUNWAY,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.RUNWAY),
    externalModelId: 'gen4.5',
    outputType: 'VIDEO',
    available: true,
    officialUrl: 'https://docs.dev.runwayml.com/guides/models/',
    timeoutMs: 300_000,
    qualityTier: 'premium',
  },
  // #9.1 — Runway Gen-4 Turbo, faster/cost-efficient I2V
  {
    id: AI_MODELS.RUNWAY_GEN4_TURBO,
    cost: 5,
    adapterType: AI_ADAPTER_TYPES.RUNWAY,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.RUNWAY),
    externalModelId: 'gen4_turbo',
    outputType: 'VIDEO',
    available: true,
    officialUrl: 'https://docs.dev.runwayml.com/guides/models/',
    timeoutMs: 300_000,
    qualityTier: 'standard',
    requiresReferenceImage: true,
  },
  // #9.2 — Runway Gen-3, legacy fal-hosted I2V kept for historical records
  {
    id: AI_MODELS.RUNWAY_GEN3,
    cost: 5,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/runway-gen3/turbo/image-to-video',
    outputType: 'VIDEO',
    available: false,
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
]
