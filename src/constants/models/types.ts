import type { OutputType } from '@/types'
import type { AudioKind } from '@/constants/audio-options'
import type { AI_ADAPTER_TYPES, ProviderConfig } from '@/constants/providers'
import type { VideoResolution } from '@/constants/video-options'
import type { AI_MODELS } from '@/constants/models/enum'
import type { ImageKind } from '@/constants/models/image'
import type { VideoKind } from '@/constants/models/video'

/** Quality tier for all models */
export type QualityTier = 'budget' | 'standard' | 'premium'

/** Style/use-case tag for model grouping */
export type StyleTag =
  | 'photorealistic'
  | 'anime'
  | 'design'
  | 'artistic'
  | 'general'

/** Model-specific default parameters for video generation */
export interface VideoDefaults {
  negativePrompt?: string
  resolution?: VideoResolution
  cfgScale?: number
  enablePromptOptimizer?: boolean
  generateAudio?: boolean
}

/** Video extension configuration for long video pipeline */
export interface VideoExtensionConfig {
  /** FAL extend endpoint ID (for native_extend method) */
  extendEndpointId?: string
  /** Extension method */
  extensionMethod: 'native_extend' | 'last_frame_chain'
  /** Duration per extension clip in seconds */
  extensionClipDuration: number
  /** Maximum total achievable duration in seconds */
  maxTotalDuration: number
}

/** Model option configuration */
export interface ModelOption {
  id: AI_MODELS
  cost: number
  adapterType: AI_ADAPTER_TYPES
  providerConfig: ProviderConfig
  externalModelId: string
  outputType: OutputType
  /**
   * For AUDIO models: which kind of audio this produces. A capability
   * attribute, not a separate mode. Omitted → speech (see DEFAULT_AUDIO_KIND).
   */
  audioKind?: AudioKind
  /**
   * For IMAGE models: what the entry is for (generate / edit / lora-base).
   * Omitted → generate (see DEFAULT_IMAGE_KIND).
   */
  imageKind?: ImageKind
  /**
   * For VIDEO models: what the entry is for (generate / edit).
   * Omitted → generate (see DEFAULT_VIDEO_KIND).
   */
  videoKind?: VideoKind
  available: boolean
  officialUrl?: string
  timeoutMs?: number
  qualityTier?: QualityTier
  styleTag?: StyleTag
  i2vModelId?: string
  videoDefaults?: VideoDefaults
  supportsLora?: boolean
  videoExtension?: VideoExtensionConfig
  requiresReferenceImage?: boolean
  /**
   * Vendor-documented max prompt characters — the only prompt length limit the
   * app enforces (UI blocks before sending, the generate services reject above
   * it). Omit when the vendor documents none: the prompt is then uncapped apart
   * from the `PROMPT_TEXT_GUARD_MAX_CHARS` abuse guard. Provider limits vary
   * widely — see the per-model values in image.ts / video.ts.
   */
  maxPromptChars?: number
}
