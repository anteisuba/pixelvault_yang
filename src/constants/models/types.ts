import type { OutputType } from '@/types'
import type { AI_ADAPTER_TYPES, ProviderConfig } from '@/constants/providers'
import type { VideoResolution } from '@/constants/video-options'
import type { AI_MODELS } from '@/constants/models/enum'

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
  available: boolean
  freeTier?: boolean
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
   * Max prompt characters the model's text encoder can actually use. The UI
   * gates quick-mode freePrompt against this; omit to fall back to
   * CARD_RECIPE.FREE_PROMPT_MAX_LENGTH. Provider limits vary widely — see the
   * per-model values in image.ts (e.g. FLUX.1 schnell ~256 tok ≈ 1000 chars).
   */
  maxPromptChars?: number
}
