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
    // v1.1 (2026) — adds synchronized native audio, multilingual lip-sync and
    // 1080p. Both v1.1 and v1.0 sit in the top 5 of the Artificial Analysis
    // video arena; v1.1 is the direct successor so the enum id stays.
    externalModelId: 'alibaba/happy-horse/v1.1/text-to-video',
    outputType: 'VIDEO',
    available: true,
    officialUrl: 'https://fal.ai/models/alibaba/happy-horse/v1.1/text-to-video',
    timeoutMs: 300_000,
    qualityTier: 'premium',
    i2vModelId: 'alibaba/happy-horse/v1.1/image-to-video',
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
    // Retired 2026-07-26 — dropped out of the top 5 on all three Artificial
    // Analysis video arenas and was the priciest entry (8 credits). Native
    // video extension stays available via KLING_V3_PRO.
    available: false,
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
    // Tops all three Artificial Analysis video arenas (T2V ±audio and I2V).
    // Runs on the Interactions API — see geminiAdapter.submitVideoToQueue.
    // Official docs still mark Omni Flash as preview (ai.google.dev, 2026-07-06
    // last-updated on page). There is no public non-preview id yet — keep
    // preview execution id until Google publishes GA.
    id: AI_MODELS.GEMINI_OMNI_FLASH,
    cost: 6,
    adapterType: AI_ADAPTER_TYPES.GEMINI,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.GEMINI),
    externalModelId: 'gemini-omni-flash-preview',
    outputType: 'VIDEO',
    available: true,
    officialUrl: 'https://ai.google.dev/gemini-api/docs/omni',
    timeoutMs: 300_000,
    qualityTier: 'premium',
    // i2v runs through the same endpoint — the adapter switches
    // video_config.task to image_to_video when a reference image is present.
    videoDefaults: {
      generateAudio: true,
      resolution: '720p',
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
    // Kling VIDEO 3.0 Omni (O3) Pro — element / video-reference heavy track.
    // Body shape matches V3 Pro for prompt, duration (3–15s), generate_audio,
    // start_image_url, aspect_ratio (see fal kling-video/o3/pro/*).
    id: AI_MODELS.KLING_O3_PRO,
    cost: 7,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/kling-video/o3/pro/text-to-video',
    outputType: 'VIDEO',
    available: true,
    officialUrl:
      'https://fal.ai/models/fal-ai/kling-video/o3/pro/text-to-video',
    timeoutMs: 300_000,
    qualityTier: 'premium',
    i2vModelId: 'fal-ai/kling-video/o3/pro/image-to-video',
    videoDefaults: {
      negativePrompt: 'blur, distort, and low quality',
      cfgScale: 0.5,
      generateAudio: true,
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
  // ─── Seedance 2.5 (VolcEngine) — reserved, upstream not open yet ────────
  // 2026-08-01 状态：火山已公开定价（70 / 42 元每百万 token，仅 480p/720p）与
  // 模型详情页（族 id `doubao-seedance-2-5`），但「创建视频生成任务」API 文档
  // 明写「在线体验与 API 调用即将上线」，模型列表页也还没有带日期的 model id。
  //
  // ⚠ GA 时要改的三件事，别只改第一件：
  //   1. externalModelId → 真实带日期 id（形如 doubao-seedance-2-5-YYMMDD）
  //   2. available → true
  //   3. **重新核对 supportedDurations** —— 下面那份是从 2.0 抄来的占位值。
  //      2.5 的卖点是原生直出 30 秒，官方定价示例里输入视频可达 30s，所以真实
  //      时长档大概率超出 4~15。宁可少给（用户选不到 30s）也别多给（直接 400）。
  //
  // fal 侧不接：`bytedance/seedance-2.5/*` 页面存在但挂 early-access 白名单，
  // 条款写死 B2B only（须校验终端用户为企业），PixelVault 是个人消费者产品，
  // 不符合准入 —— 见 docs/references/model-catalog.md §⑥。
  {
    id: AI_MODELS.SEEDANCE_25_VOLCENGINE,
    cost: 8,
    adapterType: AI_ADAPTER_TYPES.VOLCENGINE,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.VOLCENGINE),
    // PLACEHOLDER — the published family id, not a callable dated id.
    externalModelId: 'doubao-seedance-2-5',
    outputType: 'VIDEO',
    available: false,
    officialUrl:
      'https://console.volcengine.com/ark/region:cn-beijing/model/detail?Id=doubao-seedance-2-5',
    timeoutMs: 300_000,
    qualityTier: 'premium',
    videoDefaults: {
      generateAudio: true,
      resolution: '720p',
    },
  },
  {
    id: AI_MODELS.SEEDANCE_25_REFERENCE_VOLCENGINE,
    cost: 8,
    adapterType: AI_ADAPTER_TYPES.VOLCENGINE,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.VOLCENGINE),
    externalModelId: 'doubao-seedance-2-5',
    outputType: 'VIDEO',
    available: false,
    officialUrl:
      'https://console.volcengine.com/ark/region:cn-beijing/model/detail?Id=doubao-seedance-2-5',
    timeoutMs: 300_000,
    qualityTier: 'premium',
    requiresReferenceImage: true,
    videoDefaults: {
      generateAudio: true,
      resolution: '720p',
    },
  },
  // ─── MiniMax H3 — native direct, two stations ───────────────────────────
  // Not on fal on purpose: fal resells the same model at exactly 2× native
  // ($0.26 vs $0.13 per 2K second — docs/references/model-pricing.md).
  // Global and CN are separate accounts with non-interchangeable keys, so each
  // station gets its own adapterType and its own catalog entries.
  // ⚠ 2K is the only output resolution H3 offers — hence the '2k' addition to
  // VIDEO_RESOLUTIONS. Never leave supportedResolutions empty for these.
  {
    id: AI_MODELS.MINIMAX_H3,
    cost: 5,
    adapterType: AI_ADAPTER_TYPES.MINIMAX,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.MINIMAX),
    externalModelId: 'MiniMax-H3',
    outputType: 'VIDEO',
    available: true,
    officialUrl: 'https://platform.minimax.io/docs/guides/video-generation',
    timeoutMs: 300_000,
    qualityTier: 'premium',
    // i2v runs through the same execution id — the adapter promotes the
    // reference image to a `first_frame` content entry.
    videoDefaults: {
      generateAudio: true,
      resolution: '2k',
    },
  },
  {
    id: AI_MODELS.MINIMAX_H3_REFERENCE,
    cost: 5,
    adapterType: AI_ADAPTER_TYPES.MINIMAX,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.MINIMAX),
    externalModelId: 'MiniMax-H3',
    outputType: 'VIDEO',
    available: true,
    officialUrl: 'https://platform.minimax.io/docs/guides/video-generation',
    timeoutMs: 300_000,
    qualityTier: 'premium',
    requiresReferenceImage: true,
    videoDefaults: {
      generateAudio: true,
      resolution: '2k',
    },
  },
  {
    id: AI_MODELS.MINIMAX_H3_CN,
    cost: 5,
    adapterType: AI_ADAPTER_TYPES.MINIMAX_CN,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.MINIMAX_CN),
    externalModelId: 'MiniMax-H3',
    outputType: 'VIDEO',
    available: true,
    officialUrl: 'https://platform.minimaxi.com/document/video_generation',
    timeoutMs: 300_000,
    qualityTier: 'premium',
    videoDefaults: {
      generateAudio: true,
      resolution: '2k',
    },
  },
  {
    id: AI_MODELS.MINIMAX_H3_REFERENCE_CN,
    cost: 5,
    adapterType: AI_ADAPTER_TYPES.MINIMAX_CN,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.MINIMAX_CN),
    externalModelId: 'MiniMax-H3',
    outputType: 'VIDEO',
    available: true,
    officialUrl: 'https://platform.minimaxi.com/document/video_generation',
    timeoutMs: 300_000,
    qualityTier: 'premium',
    requiresReferenceImage: true,
    videoDefaults: {
      generateAudio: true,
      resolution: '2k',
    },
  },
  {
    id: AI_MODELS.LTX_23,
    cost: 2,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/ltx-2.3/text-to-video',
    outputType: 'VIDEO',
    // Retired 2026-07-26 — absent from the arena top ranks; the budget slot is
    // better served by SEEDANCE_20_FAST.
    available: false,
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
