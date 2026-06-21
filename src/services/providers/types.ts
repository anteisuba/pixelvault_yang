import 'server-only'

import type { AspectRatio } from '@/constants/config'
import type { VideoDefaults } from '@/constants/models'
import type { AI_ADAPTER_TYPES, ProviderConfig } from '@/constants/providers'
import type {
  Model3DGenerateType,
  Model3DPolygonType,
  RodinMaterial,
  RodinMeshMode,
  RodinTextureMode,
  RodinTier,
  Trellis2Resolution,
  Trellis2TextureSize,
} from '@/constants/model-3d-generation'
import type { VideoResolution } from '@/constants/video-options'
import {
  getUnsupportedReferenceImageMessage,
  REFERENCE_IMAGE_ERROR_PATTERNS,
} from '@/constants/generation-errors'
import type { AdvancedParams, ModelHealthStatus } from '@/types'

export interface ProviderGenerationInput {
  prompt: string
  modelId: string
  aspectRatio: AspectRatio
  providerConfig: ProviderConfig
  apiKey: string
  referenceImage?: string
  /** Multiple reference images for character/style consistency */
  referenceImages?: string[]
  advancedParams?: AdvancedParams
  /** User's Civitai API token (when known) — adapters that resolve
   *  Civitai LoRA download URLs need it because civitai.com/api/download
   *  now 401s without authentication, even for public models. */
  civitaiToken?: string | null
}

export interface ProviderGenerationResult {
  imageUrl: string
  width: number
  height: number
  requestCount: number
}

export interface ProviderVideoInput {
  prompt: string
  modelId: string
  aspectRatio: AspectRatio
  providerConfig: ProviderConfig
  apiKey: string
  duration?: number
  referenceImage?: string
  timeoutMs?: number
}

export interface ProviderVideoResult {
  videoUrl: string
  thumbnailUrl?: string
  width: number
  height: number
  duration: number
  requestCount: number
  /** Optional auth headers needed to fetch the video URL (e.g. OpenAI Sora) */
  fetchHeaders?: Record<string, string>
}

export interface ProviderQueueSubmitInput {
  prompt: string
  modelId: string
  aspectRatio: AspectRatio
  providerConfig: ProviderConfig
  apiKey: string
  /**
   * Either a number of seconds, or the literal 'auto' token (Seedance 2.0
   * supports this; other builders coerce 'auto' to their configured default
   * via `asNumericDuration` in fal/video-request-builders.ts).
   */
  duration?: number | 'auto'
  /**
   * Single reference image — kept for back-compat with the bulk of video
   * models that only accept one i2v starting frame. New multi-reference
   * models (Veo 3.1) should read `referenceImages` instead; the adapter
   * normalises one to the other.
   */
  referenceImage?: string
  /** Multi-reference array for models like Veo 3.1 reference-to-video. */
  referenceImages?: string[]
  /**
   * Reference audio clips for voice cloning. Consumed only by builders for
   * models with audio.mode === 'reference' (Seedance 2.0 reference-to-video).
   */
  audioUrls?: string[]
  /**
   * Per-clip binding labels (character name per audio URL). When supplied,
   * the Seedance Reference builder labels @AudioN tokens with the character
   * name so multi-character scenes route the right voice to the right person.
   */
  audioBindings?: ReadonlyArray<{
    url: string
    characterName?: string
  }>
  /**
   * Reference video clips. Consumed only by Seedance 2.0 reference-to-video
   * (unlocks the 0.6x price multiplier).
   */
  videoUrls?: string[]
  negativePrompt?: string
  resolution?: VideoResolution
  i2vModelId?: string
  videoDefaults?: VideoDefaults
  seed?: number
}

export interface ProviderQueueSubmitResult {
  requestId: string
  statusUrl: string
  responseUrl: string
}

export interface ProviderQueueStatusInput {
  statusUrl: string
  responseUrl: string
  apiKey: string
}

export interface ProviderQueueStatusResult {
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'
  result?: ProviderVideoResult
  error?: string
  errorCode?: string
}

// ─── 3D (image-to-3D) Provider Types ─────────────────────────────

export interface ProviderModel3DInput {
  /** Public URL of the source image (already in R2) */
  imageUrl: string
  modelId: string
  providerConfig: ProviderConfig
  apiKey: string
  /** Hunyuan3D: enables PBR-textured mesh (3x cost) */
  texturedMesh?: boolean
  /** Hunyuan3D octree resolution (256/512/1024) */
  octreeResolution?: number
  /** Hunyuan3D v3/v3.1 side views for multi-view reconstruction */
  multiViewImages?: {
    backImageUrl?: string
    leftImageUrl?: string
    rightImageUrl?: string
    topImageUrl?: string
    bottomImageUrl?: string
    leftFrontImageUrl?: string
    rightFrontImageUrl?: string
  }
  /** Hunyuan3D v3/v3.1 PBR material generation */
  enablePbr?: boolean
  /** Hunyuan3D v3/v3.1 target face count */
  faceCount?: number
  /** Hunyuan3D v3/v3.1 task type */
  generateType?: Model3DGenerateType
  /** Hunyuan3D v3 low-poly polygon type */
  polygonType?: Model3DPolygonType
  /** Trellis 2 output resolution */
  trellisResolution?: Trellis2Resolution
  /** Trellis 2 texture atlas size */
  trellisTextureSize?: Trellis2TextureSize
  /** Trellis 2 final mesh vertex target */
  trellisDecimationTarget?: number
  /** Trellis 2 topology cleanup */
  trellisRemesh?: boolean
  /** Trellis 2 remesh detail projection */
  trellisRemeshProject?: number
  /** Trellis 2 structure-stage sampling steps */
  trellisStructureSamplingSteps?: number
  /** Trellis 2 shape-stage sampling steps */
  trellisShapeSamplingSteps?: number
  /** Trellis 2 texture-stage sampling steps */
  trellisTextureSamplingSteps?: number
  /** TripoSR: remove background before reconstruction */
  removeBackground?: boolean
  /** Reproducibility seed */
  seed?: number
  // ─── Hyper3D Rodin ────────────────────────────────────────────────
  /** Rodin quality tier */
  rodinTier?: RodinTier
  /** Rodin mesh topology mode */
  rodinMeshMode?: RodinMeshMode
  /** Rodin texture shading mode */
  rodinTextureMode?: RodinTextureMode
  /** Rodin PBR material type */
  rodinMaterial?: RodinMaterial
  /** Rodin: pack more geometry detail */
  rodinHighPack?: boolean
  /** Rodin: T/A canonical pose alignment */
  rodinTAPose?: boolean
  /** Rodin: HD texture quality */
  rodinHdTexture?: boolean
  /** Rodin: texture delight / lighting removal */
  rodinTextureDelight?: boolean
  /** Rodin: polygon count override */
  rodinQualityOverride?: number
  /** Rodin: additional reference image URLs */
  rodinAdditionalImageUrls?: string[]
  /** Rodin: 3D bounding box [x_min, y_min, z_min, x_max, y_max, z_max] */
  rodinBboxCondition?: number[]
}

export interface ProviderModel3DResult {
  /** Public URL of the generated GLB file (provider-temporary; download to R2) */
  modelUrl: string
  /** MIME type, typically 'application/octet-stream' or 'model/gltf-binary' */
  contentType?: string
  /** File size in bytes */
  fileSize?: number
  requestCount: number
}

export interface ProviderModel3DQueueStatusResult {
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'
  result?: ProviderModel3DResult
  error?: string
  errorCode?: string
}

export interface HealthCheckInput {
  modelId: string
  apiKey: string
  baseUrl: string
  timeoutMs: number
}

export interface HealthCheckResult {
  status: ModelHealthStatus
  latencyMs: number
  error?: string
}

/** Structured error thrown by provider adapters so callers can preserve status codes */
export class ProviderError extends Error {
  readonly status: number
  readonly detail: string
  readonly errorCode?: string

  constructor(
    provider: string,
    status: number,
    detail: string,
    options: { errorCode?: string; message?: string } = {},
  ) {
    super(options.message ?? humanizeProviderError(provider, status, detail))
    this.name = 'ProviderError'
    this.status = status
    this.detail = detail
    this.errorCode = options.errorCode
  }
}

/**
 * Convert raw provider error responses into user-friendly messages.
 * Extracts meaningful text from JSON error bodies and maps common error patterns.
 */
function humanizeProviderError(
  provider: string,
  status: number,
  detail: string,
): string {
  // Try to extract "msg" or "detail" from JSON error body
  let message = detail
  try {
    const parsed = JSON.parse(detail)
    if (typeof parsed === 'object' && parsed !== null) {
      // fal.ai format: { detail: [{ msg: "..." }] }
      if (Array.isArray(parsed.detail)) {
        const msgs = parsed.detail
          .map((d: { msg?: string }) => d.msg)
          .filter(Boolean)
        if (msgs.length > 0) message = msgs.join('; ')
      }
      // Replicate format: { detail: "..." }
      else if (typeof parsed.detail === 'string') {
        message = parsed.detail
      }
      // Google format: { error: { message: "..." } }
      else if (
        typeof parsed.error === 'object' &&
        parsed.error !== null &&
        typeof (parsed.error as { message?: unknown }).message === 'string'
      ) {
        message = (parsed.error as { message: string }).message
      }
      // Generic: { message: "..." } or { error: "..." }
      else if (typeof parsed.message === 'string') {
        message = parsed.message
      } else if (typeof parsed.error === 'string') {
        message = parsed.error
      }
    }
  } catch {
    // Not JSON — use as-is
  }

  // Map common patterns to user-friendly messages
  const patterns: [RegExp, string][] = [
    [
      /pget|weights-cache|LoRA download failed/i,
      'LoRA model file could not be loaded. Refresh the LoRA URL or try another LoRA source.',
    ],
    [
      REFERENCE_IMAGE_ERROR_PATTERNS.UNSUPPORTED_FORMAT,
      getUnsupportedReferenceImageMessage(provider),
    ],
    [
      REFERENCE_IMAGE_ERROR_PATTERNS.TOO_LARGE,
      `${provider} could not use this reference image because the file is too large. Compress it or use a smaller image, then try again.`,
    ],
    [
      REFERENCE_IMAGE_ERROR_PATTERNS.UNREACHABLE,
      `${provider} could not download the reference image. Use a direct public image URL or upload the image again.`,
    ],
    [
      REFERENCE_IMAGE_ERROR_PATTERNS.LIMIT_EXCEEDED,
      `${provider} received too many reference images for this model. Remove some reference images and try again.`,
    ],
    [
      REFERENCE_IMAGE_ERROR_PATTERNS.INVALID_DIMENSIONS,
      `${provider} rejected the reference image dimensions. Use an image with a supported size and aspect ratio, then try again.`,
    ],
    [
      /file_download_error|Failed to download the file/i,
      'LoRA model file could not be loaded. Please re-open Train LoRA to refresh the URL, then try again.',
    ],
    [
      /NSFW|safety/i,
      'Content was filtered by the safety system. Try adjusting your prompt.',
    ],
    [
      /rate.?limit|throttl/i,
      `${provider} rate limit reached. Please wait a moment and try again.`,
    ],
    [
      /out of memory|OOM/i,
      'Out of memory. Try a smaller image size or remove some LoRAs.',
    ],
    [
      /No image data returned/i,
      `${provider} returned no image. This is usually temporary — try again.`,
    ],
    [
      /not downloadable/i,
      'LoRA file URL is not accessible. Please check the URL or re-train the LoRA.',
    ],
    [
      /billing|credit|payment|exhausted\s+balance|top\s+up.*balance|insufficient.*(?:balance|credits?)|账户余额不足|余额不足|余额已耗尽|充值/i,
      `${provider} 账户余额不足，请充值或切换到有余额的 API Key。`,
    ],
    [
      /unauthorized|invalid.*key|authentication failed|invalid token|api key/i,
      `${provider} API key is invalid or expired. Please update it in the sidebar.`,
    ],
  ]

  for (const [pattern, friendly] of patterns) {
    if (pattern.test(message) || pattern.test(detail)) {
      return friendly
    }
  }

  // Fallback: clean message without raw JSON
  if (status === 429) {
    return `${provider} rate limit reached. Please wait and try again.`
  }
  if (status === 503) {
    if (provider.toLowerCase().includes('gemini')) {
      return 'The selected Gemini model is temporarily unavailable because Google is experiencing high demand. This is not an API key or billing error. Please try again later, or use Gemini 3.1 Flash Image for now.'
    }

    return `${provider} is temporarily overloaded. Please try again later or switch to another model.`
  }
  if (status === 502) {
    return `${provider} is temporarily unavailable. Please try again in a moment.`
  }

  return `${provider} error: ${message}`
}

export interface ProviderExtendVideoInput {
  /** URL of the video to extend */
  videoUrl: string
  prompt: string
  aspectRatio: AspectRatio
  providerConfig: ProviderConfig
  apiKey: string
  /** FAL extend endpoint ID, e.g. 'fal-ai/veo3.1/extend-video' */
  extendEndpointId: string
  duration?: number
}

// ─── Audio Provider Types ────────────────────────────────────────

export interface ProviderAudioInput {
  prompt: string
  modelId: string
  providerConfig: ProviderConfig
  apiKey: string
  voiceId?: string
  speakerVoiceIds?: string[]
  referenceAudioUrl?: string
  referenceText?: string
  speed?: number
  volume?: number
  normalizeLoudness?: boolean
  normalizeText?: boolean
  withTimestamps?: boolean
  format?: string
  sampleRate?: number
  mp3Bitrate?: number
  opusBitrate?: number
  latency?: string
  temperature?: number
  topP?: number
  chunkLength?: number
  repetitionPenalty?: number
}

export interface ProviderAudioTimestampSegment {
  text: string
  start: number
  end: number
}

export interface ProviderAudioResult {
  audioUrl: string
  duration: number
  format: string
  sampleRate: number
  requestCount: number
  timestamps?: ProviderAudioTimestampSegment[]
}

export interface ProviderAudioQueueStatusResult {
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'
  result?: ProviderAudioResult
  error?: string
  errorCode?: string
}

// ─── Provider Adapter Interface ──────────────────────────────────

export interface ProviderAdapter {
  readonly adapterType: AI_ADAPTER_TYPES
  generateImage(
    input: ProviderGenerationInput,
  ): Promise<ProviderGenerationResult>
  generateVideo?(input: ProviderVideoInput): Promise<ProviderVideoResult>
  submitVideoToQueue?(
    input: ProviderQueueSubmitInput,
  ): Promise<ProviderQueueSubmitResult>
  submitExtendVideoToQueue?(
    input: ProviderExtendVideoInput,
  ): Promise<ProviderQueueSubmitResult>
  checkVideoQueueStatus?(
    input: ProviderQueueStatusInput,
  ): Promise<ProviderQueueStatusResult>
  /** Synchronous audio generation (e.g. Fish Audio — returns audio immediately) */
  generateAudio?(input: ProviderAudioInput): Promise<ProviderAudioResult>
  /** Async audio queue submission (e.g. FAL F5-TTS) */
  submitAudioToQueue?(
    input: ProviderAudioInput,
  ): Promise<ProviderQueueSubmitResult>
  /** Async audio queue status polling */
  checkAudioQueueStatus?(
    input: ProviderQueueStatusInput,
  ): Promise<ProviderAudioQueueStatusResult>
  /** Async 3D queue submission (e.g. fal Hunyuan3D / TripoSR) */
  submitModel3DToQueue?(
    input: ProviderModel3DInput,
  ): Promise<ProviderQueueSubmitResult>
  /** Async 3D queue status polling */
  checkModel3DQueueStatus?(
    input: ProviderQueueStatusInput,
  ): Promise<ProviderModel3DQueueStatusResult>
  healthCheck?(input: HealthCheckInput): Promise<HealthCheckResult>
}
