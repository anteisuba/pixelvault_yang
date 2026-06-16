import {
  AI_ADAPTER_TYPES,
  getDefaultProviderConfig,
} from '@/constants/providers'
import { AI_MODELS } from '@/constants/models/enum'
import type { ModelOption } from '@/constants/models/types'

/**
 * Video generation models, ordered by recommendation. Keep only models with a
 * distinct role in short video, reference video, native audio, or budget use.
 */
export const VIDEO_MODEL_OPTIONS: ModelOption[] = [
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
  {
    id: AI_MODELS.HAPPYHORSE_10,
    cost: 5,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'alibaba/happy-horse/text-to-video',
    outputType: 'VIDEO',
    available: true,
    officialUrl: 'https://fal.ai/models/alibaba/happy-horse/text-to-video',
    timeoutMs: 300_000,
    qualityTier: 'premium',
    i2vModelId: 'alibaba/happy-horse/image-to-video',
    videoDefaults: {
      generateAudio: true,
      resolution: '720p',
    },
  },
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
  {
    id: AI_MODELS.SEEDANCE_20_FAST_REFERENCE,
    cost: 4,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'bytedance/seedance-2.0/fast/reference-to-video',
    outputType: 'VIDEO',
    available: true,
    officialUrl:
      'https://fal.ai/models/bytedance/seedance-2.0/fast/reference-to-video',
    timeoutMs: 300_000,
    qualityTier: 'standard',
    requiresReferenceImage: true,
    videoDefaults: {
      generateAudio: true,
      resolution: '720p',
    },
  },
  {
    id: AI_MODELS.SEEDANCE_20_REFERENCE,
    cost: 6,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'bytedance/seedance-2.0/reference-to-video',
    outputType: 'VIDEO',
    available: true,
    officialUrl:
      'https://fal.ai/models/bytedance/seedance-2.0/reference-to-video',
    timeoutMs: 300_000,
    qualityTier: 'premium',
    requiresReferenceImage: true,
    videoDefaults: {
      generateAudio: true,
      resolution: '720p',
    },
  },
  // ─── VolcEngine (火山方舟) direct-API Seedance variants — cn region ───────
  // Additive alongside the fal.ai entries above. The adapter transparently
  // passes externalModelId as the Ark `model` field; reference variants reuse
  // the base/fast model id and signal reference mode via requiresReferenceImage
  // (火山 i2v/reference 靠 content 传图, 不需要独立 endpoint/model id).
  {
    id: AI_MODELS.SEEDANCE_20_FAST_VOLCENGINE,
    cost: 4,
    adapterType: AI_ADAPTER_TYPES.VOLCENGINE,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.VOLCENGINE),
    externalModelId: 'doubao-seedance-2-0-fast-260128',
    outputType: 'VIDEO',
    available: true,
    officialUrl:
      'https://console.volcengine.com/ark/region:ark+cn-beijing/model',
    timeoutMs: 300_000,
    qualityTier: 'standard',
    videoDefaults: {
      generateAudio: true,
      resolution: '720p',
    },
  },
  {
    id: AI_MODELS.SEEDANCE_20_VOLCENGINE,
    cost: 6,
    adapterType: AI_ADAPTER_TYPES.VOLCENGINE,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.VOLCENGINE),
    externalModelId: 'doubao-seedance-2-0-260128',
    outputType: 'VIDEO',
    available: true,
    officialUrl:
      'https://console.volcengine.com/ark/region:ark+cn-beijing/model',
    timeoutMs: 300_000,
    qualityTier: 'premium',
    videoDefaults: {
      generateAudio: true,
      resolution: '720p',
    },
  },
  {
    id: AI_MODELS.SEEDANCE_20_FAST_REFERENCE_VOLCENGINE,
    cost: 4,
    adapterType: AI_ADAPTER_TYPES.VOLCENGINE,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.VOLCENGINE),
    externalModelId: 'doubao-seedance-2-0-fast-260128',
    outputType: 'VIDEO',
    available: true,
    officialUrl:
      'https://console.volcengine.com/ark/region:ark+cn-beijing/model',
    timeoutMs: 300_000,
    qualityTier: 'standard',
    requiresReferenceImage: true,
    videoDefaults: {
      generateAudio: true,
      resolution: '720p',
    },
  },
  {
    id: AI_MODELS.SEEDANCE_20_REFERENCE_VOLCENGINE,
    cost: 6,
    adapterType: AI_ADAPTER_TYPES.VOLCENGINE,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.VOLCENGINE),
    externalModelId: 'doubao-seedance-2-0-260128',
    outputType: 'VIDEO',
    available: true,
    officialUrl:
      'https://console.volcengine.com/ark/region:ark+cn-beijing/model',
    timeoutMs: 300_000,
    qualityTier: 'premium',
    requiresReferenceImage: true,
    videoDefaults: {
      generateAudio: true,
      resolution: '720p',
    },
  },
  {
    id: AI_MODELS.LTX_23,
    cost: 2,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/ltx-2.3/text-to-video',
    outputType: 'VIDEO',
    available: true,
    officialUrl: 'https://fal.ai/models/fal-ai/ltx-2.3/text-to-video',
    timeoutMs: 300_000,
    qualityTier: 'budget',
    i2vModelId: 'fal-ai/ltx-2.3/image-to-video',
    videoDefaults: {
      generateAudio: true,
      resolution: '1080p',
    },
  },
]
