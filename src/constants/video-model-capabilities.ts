import type { AspectRatio } from '@/constants/config'
import { AI_MODELS, getModelById } from '@/constants/models'
import {
  DEFAULT_VIDEO_DURATIONS,
  VIDEO_ASPECT_RATIOS,
  VIDEO_RESOLUTIONS,
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
  supportedResolutions: VIDEO_RESOLUTIONS,
  supportedAspectRatios: VIDEO_ASPECT_RATIOS,
  requiresReferenceImage: false,
  audio: { mode: 'auto' } as VideoAudioCapability,
} as const satisfies VideoModelCapabilities

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
