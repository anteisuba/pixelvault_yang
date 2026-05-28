import type { AspectRatio } from '@/constants/config'
import { AI_MODELS, getModelById } from '@/constants/models'
import {
  DEFAULT_VIDEO_DURATIONS,
  VIDEO_ASPECT_RATIOS,
  VIDEO_RESOLUTIONS,
  type VideoResolution,
} from '@/constants/video-options'

/**
 * 'auto' — model auto-generates audio via generate_audio: boolean. User cannot
 *          choose which voice; voice node is ignored if connected.
 * 'reference' — model accepts audio_urls[] for voice cloning. Connect a voice
 *          node whose voiceReferenceAudioUrl is populated and it will speak
 *          the prompt's "double-quoted" lines.
 */
export type VideoAudioMode = 'auto' | 'reference'

export interface VideoAudioCapability {
  mode: VideoAudioMode
  /** For 'reference' mode: max audio_urls items the endpoint accepts. */
  maxReferences?: number
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
  [AI_MODELS.RUNWAY_GEN45]: {
    supportedAspectRatios: ['16:9', '9:16'],
  },
  [AI_MODELS.RUNWAY_GEN4_TURBO]: {
    supportedAspectRatios: ['16:9', '9:16'],
    requiresReferenceImage: true,
  },
  [AI_MODELS.RUNWAY_GEN3]: {
    requiresReferenceImage: true,
  },
  [AI_MODELS.SEEDANCE_20]: {
    // fal Seedance 2.0 enum: auto | 4..15 (every integer).
    // Standard tier supports up to 1080p (Fast tier caps at 720p).
    // https://fal.ai/models/bytedance/seedance-2.0/reference-to-video
    supportedDurations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    supportedResolutions: ['480p', '720p', '1080p'],
    supportedAspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
  },
  [AI_MODELS.SEEDANCE_20_FAST]: {
    // fal Seedance 2.0 enum: auto | 4..15 (every integer).
    // Fast tier caps at 720p (no 1080p).
    // https://fal.ai/models/bytedance/seedance-2.0/reference-to-video
    supportedDurations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    supportedResolutions: ['480p', '720p'],
    supportedAspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
  },
  // ark uses one model id for all scenarios — multimodal reference (incl.
  // reference_audio) is supported on the same Volc Seedance model, so both
  // tiers expose reference-audio like the fal *_REFERENCE endpoints.
  [AI_MODELS.SEEDANCE_20_VOLC]: {
    supportedDurations: [5, 10],
    supportedResolutions: ['480p', '720p'],
    supportedAspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
    audio: { mode: 'reference', maxReferences: 3 },
  },
  [AI_MODELS.SEEDANCE_20_FAST_VOLC]: {
    supportedDurations: [5, 10],
    supportedResolutions: ['480p', '720p'],
    supportedAspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
    audio: { mode: 'reference', maxReferences: 3 },
  },
  // Voice-cloning endpoints — only path to use voice node's reference audio
  [AI_MODELS.SEEDANCE_20_REFERENCE]: {
    // fal Seedance 2.0 enum: auto | 4..15 (every integer).
    // Standard Reference tier supports up to 1080p (Fast Reference caps at 720p).
    // https://fal.ai/models/bytedance/seedance-2.0/reference-to-video
    supportedDurations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    supportedResolutions: ['480p', '720p', '1080p'],
    supportedAspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
    audio: { mode: 'reference', maxReferences: 3 },
  },
  [AI_MODELS.SEEDANCE_20_FAST_REFERENCE]: {
    // fal Seedance 2.0 enum: auto | 4..15 (every integer).
    // Fast Reference tier caps at 720p (no 1080p).
    // https://fal.ai/models/bytedance/seedance-2.0/reference-to-video
    supportedDurations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    supportedResolutions: ['480p', '720p'],
    supportedAspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
    audio: { mode: 'reference', maxReferences: 3 },
  },
  // All other video models default to audio.mode: 'auto' — the generate_audio
  // boolean controls output, but the caller cannot pick a specific voice.
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
