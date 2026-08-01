import { AI_MODELS, normalizeModelId } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

export type VideoReferenceMode =
  | 'text-or-first-frame'
  | 'multimodal-reference'
  | 'image-content-array'

export type VideoExecutionStatus = 'ready' | 'execution-not-migrated'

export interface VideoReferenceSlots {
  /**
   * undefined means that the provider has not published a hard numeric cap.
   * It must not be rendered as an invented product/provider limit.
   */
  images: number | undefined
  videos: number
  audio: number
  total?: number
  /** Audio references cannot be the only input for this model. */
  audioRequiresVisual?: boolean
}

export interface VideoParameterSupport {
  duration: boolean
  aspectRatio: boolean
  resolution: boolean
  negativePrompt: boolean
  generateAudio: boolean
  seed: boolean
}

export interface VideoModelSendContract {
  family:
    | 'seedance'
    | 'kling'
    | 'happyhorse'
    | 'gemini'
    | 'veo'
    | 'minimax'
    | 'fallback'
  referenceMode: VideoReferenceMode
  slots: VideoReferenceSlots
  parameters: VideoParameterSupport
  execution: VideoExecutionStatus
  /** Whether local @name tokens become provider positional @ImageN tokens. */
  positionalImageTokens: boolean
}

const FIRST_FRAME_SLOTS: VideoReferenceSlots = {
  images: 1,
  videos: 0,
  audio: 0,
}

const FALLBACK_CONTRACT: VideoModelSendContract = {
  family: 'fallback',
  referenceMode: 'text-or-first-frame',
  slots: FIRST_FRAME_SLOTS,
  parameters: {
    duration: true,
    aspectRatio: true,
    resolution: true,
    negativePrompt: false,
    generateAudio: false,
    seed: false,
  },
  execution: 'execution-not-migrated',
  positionalImageTokens: false,
}

const SEEDANCE_REFERENCE_IDS = new Set<string>([
  AI_MODELS.SEEDANCE_20_REFERENCE,
  AI_MODELS.SEEDANCE_20_FAST_REFERENCE,
  AI_MODELS.SEEDANCE_20_REFERENCE_VOLCENGINE,
  AI_MODELS.SEEDANCE_20_FAST_REFERENCE_VOLCENGINE,
  // 2.5 keeps the 2.0 multimodal-reference shape (图 0-9 + 视频 0-3 + 音频 0-3,
  // 音频不可独存) per 火山's own API doc. Reserved until the model id ships.
  AI_MODELS.SEEDANCE_25_REFERENCE_VOLCENGINE,
])

const SEEDANCE_IDS = new Set<string>([
  AI_MODELS.SEEDANCE_20,
  AI_MODELS.SEEDANCE_20_FAST,
  AI_MODELS.SEEDANCE_20_VOLCENGINE,
  AI_MODELS.SEEDANCE_20_FAST_VOLCENGINE,
  AI_MODELS.SEEDANCE_25_VOLCENGINE,
  ...SEEDANCE_REFERENCE_IDS,
])

const MINIMAX_REFERENCE_IDS = new Set<string>([
  AI_MODELS.MINIMAX_H3_REFERENCE,
  AI_MODELS.MINIMAX_H3_REFERENCE_CN,
])

const MINIMAX_IDS = new Set<string>([
  AI_MODELS.MINIMAX_H3,
  AI_MODELS.MINIMAX_H3_CN,
  ...MINIMAX_REFERENCE_IDS,
])

/**
 * Adapters the Execution Worker can actually run video on. Must stay in step
 * with `WORKER_CAPABLE_VIDEO_ADAPTERS` in generate-video.service.ts — this one
 * decides what the UI offers as sendable, that one decides what the service
 * accepts. Gemini and VolcEngine stay off the list: selectable for discovery
 * and key setup, but not presented as sendable until they're migrated too.
 */
const WORKER_READY_VIDEO_ADAPTERS: ReadonlySet<string> = new Set([
  AI_ADAPTER_TYPES.FAL,
  AI_ADAPTER_TYPES.MINIMAX,
  AI_ADAPTER_TYPES.MINIMAX_CN,
  AI_ADAPTER_TYPES.VOLCENGINE,
])

function executionStatus(
  adapterType: AI_ADAPTER_TYPES | undefined,
): VideoExecutionStatus {
  return adapterType && WORKER_READY_VIDEO_ADAPTERS.has(adapterType)
    ? 'ready'
    : 'execution-not-migrated'
}

export function getVideoModelSendContract(
  modelId: string | undefined,
  adapterType?: AI_ADAPTER_TYPES,
): VideoModelSendContract {
  if (!modelId) return FALLBACK_CONTRACT
  const normalized = normalizeModelId(modelId)

  if (SEEDANCE_IDS.has(normalized)) {
    const referenceMode = SEEDANCE_REFERENCE_IDS.has(normalized)
    return {
      family: 'seedance',
      referenceMode: referenceMode
        ? 'multimodal-reference'
        : 'text-or-first-frame',
      slots: referenceMode
        ? {
            images: 9,
            videos: 3,
            audio: 3,
            total: 12,
            audioRequiresVisual: true,
          }
        : FIRST_FRAME_SLOTS,
      parameters: {
        duration: true,
        aspectRatio: true,
        resolution: true,
        negativePrompt: false,
        generateAudio: true,
        seed: true,
      },
      execution: executionStatus(adapterType),
      positionalImageTokens: referenceMode,
    }
  }

  if (MINIMAX_IDS.has(normalized)) {
    const referenceMode = MINIMAX_REFERENCE_IDS.has(normalized)
    return {
      family: 'minimax',
      referenceMode: referenceMode
        ? 'multimodal-reference'
        : 'text-or-first-frame',
      // Identical 9/3/3-capped-at-12 shape to Seedance reference, including the
      // "audio can't be the only reference" rule.
      slots: referenceMode
        ? {
            images: 9,
            videos: 3,
            audio: 3,
            total: 12,
            audioRequiresVisual: true,
          }
        : FIRST_FRAME_SLOTS,
      parameters: {
        duration: true,
        aspectRatio: true,
        // 2K is the only output H3 offers, so the picker has nothing to pick.
        resolution: false,
        negativePrompt: false,
        // Audio is inherent to H3 output, not a toggle.
        generateAudio: false,
        seed: false,
      },
      execution: executionStatus(adapterType),
      positionalImageTokens: referenceMode,
    }
  }

  if (
    normalized === AI_MODELS.KLING_V3_PRO ||
    normalized === AI_MODELS.KLING_O3_PRO
  ) {
    // O3 Omni currently shares the V3 request shape in our fal builders
    // (prompt / duration / generate_audio / start_image_url). Element & multi
    // video-reference UI for O3 is a later surface — catalog + switcher first.
    return {
      family: 'kling',
      referenceMode: 'text-or-first-frame',
      slots: FIRST_FRAME_SLOTS,
      parameters: {
        duration: true,
        aspectRatio: true,
        resolution: false,
        negativePrompt: true,
        generateAudio: true,
        seed: false,
      },
      execution: executionStatus(adapterType),
      positionalImageTokens: false,
    }
  }

  if (normalized === AI_MODELS.HAPPYHORSE_10) {
    return {
      family: 'happyhorse',
      referenceMode: 'text-or-first-frame',
      slots: FIRST_FRAME_SLOTS,
      parameters: {
        duration: true,
        aspectRatio: true,
        resolution: true,
        negativePrompt: false,
        // HappyHorse generates synchronized native audio, but the public v1.1
        // input schema does not expose a generate_audio switch.
        generateAudio: false,
        seed: true,
      },
      execution: executionStatus(adapterType),
      positionalImageTokens: false,
    }
  }

  if (normalized === AI_MODELS.GEMINI_OMNI_FLASH) {
    return {
      family: 'gemini',
      referenceMode: 'image-content-array',
      slots: {
        // The official preview guide demonstrates multiple image references
        // but does not publish a hard maximum. Do not reuse the generic Gemini
        // image-edit cap here.
        images: undefined,
        videos: 0,
        audio: 0,
      },
      parameters: {
        duration: false,
        aspectRatio: true,
        resolution: false,
        negativePrompt: false,
        generateAudio: false,
        seed: false,
      },
      execution: 'execution-not-migrated',
      positionalImageTokens: false,
    }
  }

  if (normalized === AI_MODELS.VEO_31) {
    return {
      family: 'veo',
      referenceMode: 'image-content-array',
      slots: { images: 3, videos: 0, audio: 0 },
      parameters: {
        duration: true,
        aspectRatio: true,
        resolution: true,
        negativePrompt: true,
        generateAudio: true,
        seed: true,
      },
      execution: executionStatus(adapterType),
      positionalImageTokens: false,
    }
  }

  // A FAL adapter alone does not mean the execution worker knows how to
  // serialize an arbitrary/custom video model. Only the explicit families
  // above are safe to mark runnable.
  return FALLBACK_CONTRACT
}

export function getVideoModelImageLimit(
  modelId: string | undefined,
  adapterType?: AI_ADAPTER_TYPES,
): number | undefined {
  if (!modelId) return undefined
  return getVideoModelSendContract(modelId, adapterType).slots.images
}
