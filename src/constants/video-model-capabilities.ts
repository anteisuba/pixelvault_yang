import type { AspectRatio } from '@/constants/config'
import { AI_MODELS, getModelById } from '@/constants/models'
import {
  DEFAULT_VIDEO_DURATIONS,
  DEFAULT_VIDEO_RESOLUTIONS,
  VIDEO_ASPECT_RATIOS,
  type VideoResolution,
} from '@/constants/video-options'

/**
 * 'auto': model auto-generates audio; the user cannot choose a voice.
 * 'reference': model accepts audio_urls[] for voice cloning.
 */
export type VideoAudioMode = 'auto' | 'reference'

export interface VideoAudioCapability {
  mode: VideoAudioMode
  maxReferences?: number
}

/**
 * seed 支持矩阵（spike 2026-06-20，fal 一手 OpenAPI + volcengine 镜像）：
 * Seedance 全族（fal + 火山）+ Veo base(text-to-video) 接受 `seed`；
 * Veo reference-to-video（hasReferenceInputs）/ Kling V3 Pro / LTX 2.3 不接受。
 * 驱动 VideoComposer seed 控件的显隐；worker builder 另有同口径的安全网。
 */
const SEED_CAPABLE_SEEDANCE: ReadonlySet<string> = new Set([
  AI_MODELS.SEEDANCE_20,
  AI_MODELS.SEEDANCE_20_FAST,
  AI_MODELS.SEEDANCE_20_REFERENCE,
  AI_MODELS.SEEDANCE_20_FAST_REFERENCE,
  AI_MODELS.SEEDANCE_20_VOLCENGINE,
  AI_MODELS.SEEDANCE_20_FAST_VOLCENGINE,
  AI_MODELS.SEEDANCE_20_REFERENCE_VOLCENGINE,
  AI_MODELS.SEEDANCE_20_FAST_REFERENCE_VOLCENGINE,
])

export function videoModelSupportsSeed(
  modelId: string,
  hasReferenceInputs: boolean,
): boolean {
  if (modelId === AI_MODELS.VEO_31) return !hasReferenceInputs
  if (modelId === AI_MODELS.HAPPYHORSE_10) return true
  return SEED_CAPABLE_SEEDANCE.has(modelId)
}

export interface VideoModelCapabilities {
  supportedDurations?: readonly number[]
  supportedResolutions?: readonly VideoResolution[]
  supportedAspectRatios?: readonly AspectRatio[]
  resolutionDurationMatrix?: Partial<Record<VideoResolution, readonly number[]>>
  requiresReferenceImage?: boolean
  audio?: VideoAudioCapability
}

export const DEFAULT_VIDEO_MODEL_CAPABILITIES = {
  supportedDurations: DEFAULT_VIDEO_DURATIONS,
  // DEFAULT_VIDEO_RESOLUTIONS, not VIDEO_RESOLUTIONS — a model must opt into
  // '2k' explicitly (see video-options.ts).
  supportedResolutions: DEFAULT_VIDEO_RESOLUTIONS,
  supportedAspectRatios: VIDEO_ASPECT_RATIOS,
  requiresReferenceImage: false,
  audio: { mode: 'auto' } as VideoAudioCapability,
} as const satisfies VideoModelCapabilities

/**
 * Seedance 2.5 的整秒时长档 [4,30]（官方「视频生成教程」→ 视频时长段）。
 * 2.0 系列停在 [4,15]，两代**不能共用一份数组** —— 给 2.0 放宽会 400，给 2.5
 * 收窄则用户选不到 30 秒这个卖点。
 *
 * 上游还支持 `duration: -1`（模型自选时长），我们的 picker 是离散秒数列表、
 * 没有「自动」这一档，故不在此暴露；要加得先在 UI 上给 -1 一个语义。
 */
const SEEDANCE_25_DURATIONS = [
  4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
  25, 26, 27, 28, 29, 30,
] as const

export const VIDEO_MODEL_CAPABILITIES: Partial<
  Record<AI_MODELS, VideoModelCapabilities>
> = {
  [AI_MODELS.SEEDANCE_20]: {
    supportedDurations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    supportedResolutions: ['480p', '720p', '1080p'],
    supportedAspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
  },
  [AI_MODELS.SEEDANCE_20_FAST]: {
    supportedDurations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    supportedResolutions: ['480p', '720p'],
    supportedAspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
  },
  [AI_MODELS.SEEDANCE_20_REFERENCE]: {
    supportedDurations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    supportedResolutions: ['480p', '720p', '1080p'],
    supportedAspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
    audio: { mode: 'reference', maxReferences: 3 },
  },
  [AI_MODELS.SEEDANCE_20_FAST_REFERENCE]: {
    supportedDurations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    supportedResolutions: ['480p', '720p'],
    supportedAspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
    audio: { mode: 'reference', maxReferences: 3 },
  },
  // VolcEngine (火山方舟) variants mirror their fal counterparts' constraints.
  [AI_MODELS.SEEDANCE_20_VOLCENGINE]: {
    supportedDurations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    supportedResolutions: ['480p', '720p', '1080p'],
    supportedAspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
  },
  [AI_MODELS.SEEDANCE_20_FAST_VOLCENGINE]: {
    supportedDurations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    supportedResolutions: ['480p', '720p'],
    supportedAspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
  },
  [AI_MODELS.SEEDANCE_20_REFERENCE_VOLCENGINE]: {
    supportedDurations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    supportedResolutions: ['480p', '720p', '1080p'],
    supportedAspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
    audio: { mode: 'reference', maxReferences: 3 },
  },
  [AI_MODELS.SEEDANCE_20_FAST_REFERENCE_VOLCENGINE]: {
    supportedDurations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    supportedResolutions: ['480p', '720p'],
    supportedAspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
    audio: { mode: 'reference', maxReferences: 3 },
  },
  [AI_MODELS.HAPPYHORSE_10]: {
    supportedDurations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    supportedResolutions: ['720p', '1080p'],
    supportedAspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
  },
  // Kling V3 / O3 Pro 没有分辨率旋钮：fal 的 4 个端点（v3、o3 各自的
  // text-to-video + image-to-video）输入 schema 里都不存在 resolution 字段，
  // Pro 档固定出 1080p（4K 是 kling-video/v3/4k/* 这个独立端点，本项目未接）。
  // buildKlingV3Pro 因此从不读 input.resolution，选了也不会发出去。
  // 与 GEMINI_OMNI_FLASH 同一处理：给一个名义值，而不是空数组——空数组会在
  // 展开合并里盖掉默认的 VIDEO_RESOLUTIONS，让 UI 出现一个零选项的空选择器。
  [AI_MODELS.KLING_V3_PRO]: {
    supportedDurations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    supportedResolutions: ['1080p'],
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
  },
  [AI_MODELS.KLING_O3_PRO]: {
    supportedDurations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    supportedResolutions: ['1080p'],
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
  },
  [AI_MODELS.LTX_23]: {
    supportedDurations: [6, 8, 10],
    supportedResolutions: ['1080p'],
    supportedAspectRatios: ['16:9', '9:16'],
  },
  [AI_MODELS.VEO_31]: {
    supportedDurations: [4, 6, 8],
    supportedResolutions: ['720p', '1080p'],
    supportedAspectRatios: ['16:9', '9:16'],
  },
  // The Interactions API exposes no duration knob — Omni Flash decides (docs
  // say 3–10s). A single nominal value keeps the UI honest instead of offering
  // a picker that silently does nothing.
  [AI_MODELS.GEMINI_OMNI_FLASH]: {
    supportedDurations: [8],
    supportedResolutions: ['720p'],
    supportedAspectRatios: ['16:9', '9:16'],
  },
  // Seedance 2.5 — GA 2026-08-07. 官方「视频生成教程」的时长段原文：
  // 「Seedance 2.0 系列: [4,15] 或设置为 -1 / **Seedance 2.5: [4,30] 或 -1**」。
  // 480p/720p 是全部档位，2.5 没有 1080p/4k（4k 仅 2.0 独有）。
  // ⚠ 时长比 2.0 长一倍，别把这份数组和 2.0 那几行合并去重。
  [AI_MODELS.SEEDANCE_25_VOLCENGINE]: {
    supportedDurations: SEEDANCE_25_DURATIONS,
    supportedResolutions: ['480p', '720p'],
    supportedAspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
  },
  // maxReferences 10（不是 2.0 的 3）：官方「使用限制」段写明 2.5 最多传入 10
  // 段参考音频、总时长 ≤30s，而 2.0 系列是 3 段 / ≤15s。
  [AI_MODELS.SEEDANCE_25_REFERENCE_VOLCENGINE]: {
    supportedDurations: SEEDANCE_25_DURATIONS,
    supportedResolutions: ['480p', '720p'],
    supportedAspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
    audio: { mode: 'reference', maxReferences: 10 },
  },
  // MiniMax H3 — 2K is the ONLY output resolution the model offers, on both
  // stations. A single-entry list (not an empty array) keeps the picker honest
  // instead of collapsing to zero options, same treatment as Kling above.
  // Durations are integer seconds 4–15. H3 also accepts 21:9 and an
  // 'adaptive' ratio; neither is in VIDEO_ASPECT_RATIOS, so they're simply not
  // offered — the five below are the intersection.
  [AI_MODELS.MINIMAX_H3]: {
    supportedDurations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    supportedResolutions: ['2k'],
    supportedAspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
  },
  [AI_MODELS.MINIMAX_H3_CN]: {
    supportedDurations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    supportedResolutions: ['2k'],
    supportedAspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
  },
  // Reference face: up to 3 voice-donor clips, matching the provider cap.
  [AI_MODELS.MINIMAX_H3_REFERENCE]: {
    supportedDurations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    supportedResolutions: ['2k'],
    supportedAspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
    audio: { mode: 'reference', maxReferences: 3 },
  },
  [AI_MODELS.MINIMAX_H3_REFERENCE_CN]: {
    supportedDurations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    supportedResolutions: ['2k'],
    supportedAspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
    audio: { mode: 'reference', maxReferences: 3 },
  },
}

export function getVideoModelCapabilities(
  modelId: string,
): VideoModelCapabilities {
  const builtInModel = getModelById(modelId)

  return {
    ...DEFAULT_VIDEO_MODEL_CAPABILITIES,
    requiresReferenceImage: builtInModel?.requiresReferenceImage ?? false,
    ...(builtInModel ? VIDEO_MODEL_CAPABILITIES[builtInModel.id] : undefined),
  }
}

export function getVideoAudioCapability(
  modelId: string | undefined,
): VideoAudioCapability {
  if (!modelId) return DEFAULT_VIDEO_MODEL_CAPABILITIES.audio
  return (
    getVideoModelCapabilities(modelId).audio ??
    DEFAULT_VIDEO_MODEL_CAPABILITIES.audio
  )
}
