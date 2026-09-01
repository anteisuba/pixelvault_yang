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
    id: AI_MODELS.WAN_30,
    // $0.10/s at the 720p base tier — the cheapest premium video in the
    // catalog per second (HappyHorse $0.14, Kling $0.112, Seedance 2.0
    // $0.3034). Priced at 5 to sit level with HappyHorse: cheaper per second,
    // but the 30s ceiling makes a typical run land higher.
    cost: 5,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'alibaba/wan-3.0/text-to-video',
    outputType: 'VIDEO',
    available: true,
    officialUrl: 'https://fal.ai/models/alibaba/wan-3.0/text-to-video',
    // ⚠ `timeoutMs` bounds the **submit** step only — the worker passes it to
    // `step.do('submit-provider', { timeout })`. The wait budget for the
    // generation itself is `maxAttempts × pollIntervalMs`
    // (EXECUTION_WORKER: 200 × 3s = 600s), which is global, not per-model.
    // Raising this number does nothing for long renders; don't "fix" a 30s
    // timeout here.
    timeoutMs: 300_000,
    qualityTier: 'premium',
    // Same endpoint family: t2v takes `prompt`, i2v takes `start_image_url`
    // (+ optional `end_image_url` — the first fal video model in the catalog
    // that can actually do first+last frame).
    i2vModelId: 'alibaba/wan-3.0/image-to-video',
    videoDefaults: {
      generateAudio: true,
      // fal defaults to 1080p; the catalog pins 720p so the price the user
      // sees (unit-prices is a 720p-based figure) matches what we send.
      resolution: '720p',
    },
  },
  {
    id: AI_MODELS.WAN_30_REFERENCE,
    cost: 5,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'alibaba/wan-3.0/reference-to-video',
    outputType: 'VIDEO',
    available: true,
    officialUrl: 'https://fal.ai/models/alibaba/wan-3.0/reference-to-video',
    timeoutMs: 300_000,
    qualityTier: 'premium',
    requiresReferenceImage: true,
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
    // Runs on the Interactions API. ⚠ available:true but NOT actually
    // reachable: canSubmitVideoViaExecutionWorker never allowlisted Gemini,
    // so every request 501s. The Next.js-side implementation (formerly
    // geminiAdapter.submitVideoToQueue/checkVideoQueueStatus) was deleted as
    // dead code 2026-08-24 (dead-chain cleanup) and was never migrated to
    // workers/execution — see docs/references/model-catalog.md §7 for the
    // historical API-shape notes. Flip available:false or finish the worker
    // migration before touching this entry.
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
  // BytePlus ModelArk is the international Seedance station. It shares the
  // Ark request shape with VolcEngine, but owns a separate host and key slot.
  {
    id: AI_MODELS.SEEDANCE_20_FAST_BYTEPLUS,
    cost: 4,
    adapterType: AI_ADAPTER_TYPES.BYTEPLUS,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.BYTEPLUS),
    externalModelId: 'dreamina-seedance-2-0-fast-260128',
    outputType: 'VIDEO',
    available: true,
    officialUrl: 'https://docs.byteplus.com/en/docs/ModelArk/1520757',
    timeoutMs: 300_000,
    qualityTier: 'standard',
    videoDefaults: { generateAudio: true, resolution: '720p' },
  },
  {
    id: AI_MODELS.SEEDANCE_20_BYTEPLUS,
    cost: 6,
    adapterType: AI_ADAPTER_TYPES.BYTEPLUS,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.BYTEPLUS),
    externalModelId: 'dreamina-seedance-2-0-260128',
    outputType: 'VIDEO',
    available: true,
    officialUrl: 'https://docs.byteplus.com/en/docs/ModelArk/1520757',
    timeoutMs: 300_000,
    qualityTier: 'premium',
    videoDefaults: { generateAudio: true, resolution: '720p' },
  },
  {
    id: AI_MODELS.SEEDANCE_20_FAST_REFERENCE_BYTEPLUS,
    cost: 4,
    adapterType: AI_ADAPTER_TYPES.BYTEPLUS,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.BYTEPLUS),
    externalModelId: 'dreamina-seedance-2-0-fast-260128',
    outputType: 'VIDEO',
    available: true,
    officialUrl: 'https://docs.byteplus.com/en/docs/ModelArk/1520757',
    timeoutMs: 300_000,
    qualityTier: 'standard',
    requiresReferenceImage: true,
    videoDefaults: { generateAudio: true, resolution: '720p' },
  },
  {
    id: AI_MODELS.SEEDANCE_20_REFERENCE_BYTEPLUS,
    cost: 6,
    adapterType: AI_ADAPTER_TYPES.BYTEPLUS,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.BYTEPLUS),
    externalModelId: 'dreamina-seedance-2-0-260128',
    outputType: 'VIDEO',
    available: true,
    officialUrl: 'https://docs.byteplus.com/en/docs/ModelArk/1520757',
    timeoutMs: 300_000,
    qualityTier: 'premium',
    requiresReferenceImage: true,
    videoDefaults: { generateAudio: true, resolution: '720p' },
  },
  // ─── Seedance 2.5 — fal + VolcEngine China + BytePlus international ─────
  // fal's public model index and OpenAPI expose separate text/image/reference
  // endpoints. Ark uses one execution id and distinguishes modes in `content`.
  {
    id: AI_MODELS.SEEDANCE_25,
    cost: 8,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'bytedance/seedance-2.5/text-to-video',
    i2vModelId: 'bytedance/seedance-2.5/image-to-video',
    outputType: 'VIDEO',
    available: true,
    officialUrl: 'https://fal.ai/models/bytedance/seedance-2.5/text-to-video',
    timeoutMs: 300_000,
    qualityTier: 'premium',
    videoDefaults: { generateAudio: true, resolution: '720p' },
  },
  {
    id: AI_MODELS.SEEDANCE_25_REFERENCE,
    cost: 8,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'bytedance/seedance-2.5/reference-to-video',
    outputType: 'VIDEO',
    available: true,
    officialUrl:
      'https://fal.ai/models/bytedance/seedance-2.5/reference-to-video',
    timeoutMs: 300_000,
    qualityTier: 'premium',
    requiresReferenceImage: true,
    videoDefaults: { generateAudio: true, resolution: '720p' },
  },
  {
    id: AI_MODELS.SEEDANCE_25_BYTEPLUS,
    cost: 8,
    adapterType: AI_ADAPTER_TYPES.BYTEPLUS,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.BYTEPLUS),
    externalModelId: 'dreamina-seedance-2-5-260628',
    outputType: 'VIDEO',
    available: true,
    officialUrl: 'https://docs.byteplus.com/en/docs/ModelArk/1330310',
    timeoutMs: 300_000,
    qualityTier: 'premium',
    videoDefaults: { generateAudio: true, resolution: '720p' },
  },
  {
    id: AI_MODELS.SEEDANCE_25_REFERENCE_BYTEPLUS,
    cost: 8,
    adapterType: AI_ADAPTER_TYPES.BYTEPLUS,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.BYTEPLUS),
    externalModelId: 'dreamina-seedance-2-5-260628',
    outputType: 'VIDEO',
    available: true,
    officialUrl: 'https://docs.byteplus.com/en/docs/ModelArk/1330310',
    timeoutMs: 300_000,
    qualityTier: 'premium',
    requiresReferenceImage: true,
    videoDefaults: { generateAudio: true, resolution: '720p' },
  },
  // VolcEngine China GA'd on 2026-08-07.
  // 火山方舟 2026-08-07 上线 API。带日期 model id 取自官方「视频生成教程」的
  // 模型能力表（docs.volcengine.com/docs/82379/2298881，页脚更新 08-07 13:46）。
  // ⚠ 该文档站是 SPA，curl 只抓得到侧边栏，正文必须真浏览器打开。
  //
  // 与 2.0 的差异已按代分叉，改任何一处前先读另外两处：
  //   - supportedDurations：2.5 是 [4,30]，2.0 是 [4,15]（video-model-capabilities.ts）
  //   - 多模态素材上限：2.5 是 30/10/10 且纯音频可独存，2.0 是 9/3/3 且不可独存
  //     （video-model-send-plan.ts 的 SEEDANCE_25_REFERENCE_SLOTS）
  //
  // ⚠ 尚未实现的上游约束：2.5 在首帧/首尾帧/视频编辑/视频延长场景下 `ratio`
  // 仅接受 `adaptive`，传具体宽高比会 400。我们目前没有 adaptive 这个选项，
  // 首帧场景撞得上 —— 见 docs/references/model-catalog.md §⑬。
  //
  {
    id: AI_MODELS.SEEDANCE_25_VOLCENGINE,
    cost: 8,
    adapterType: AI_ADAPTER_TYPES.VOLCENGINE,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.VOLCENGINE),
    externalModelId: 'doubao-seedance-2-5-260628',
    outputType: 'VIDEO',
    available: true,
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
    externalModelId: 'doubao-seedance-2-5-260628',
    outputType: 'VIDEO',
    available: true,
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
  // ⚠ 2K is the only resolution WE ship for H3 — hence the '2k' addition to
  // VIDEO_RESOLUTIONS. Never leave supportedResolutions empty for these.
  // ⛔ This is a product choice, NOT a model limit. The earlier wording ("2K is
  // the only output resolution H3 offers") was wrong: MiniMax's own Output
  // Specs list 768P / 2K, and the pricing page bills 768P separately (2026-08-23:
  // $0.08/s global, ¥0.50/s CN, vs $0.13 / ¥0.80 for 2K). Corrected so nobody
  // refuses a 768P tier on the grounds that the model can't do it.
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
