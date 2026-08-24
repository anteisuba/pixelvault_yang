import 'server-only'

import type { AudioExpressivenessTier } from '@/constants/audio-options'
import type { AI_ADAPTER_TYPES, ProviderConfig } from '@/constants/providers'
import {
  getUnsupportedReferenceImageMessage,
  REFERENCE_IMAGE_ERROR_PATTERNS,
} from '@/constants/generation-errors'
import type { ModelHealthStatus } from '@/types'

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
  /** Resolved expressiveness tier — adapters compile it into provider params. */
  expressiveness?: AudioExpressivenessTier
  // ── Sound-effect (SFX) params — only used by generateSoundEffect ──
  /** Target clip length in seconds; omit to let the model auto-pick. */
  durationSeconds?: number
  /** Make the clip a seamless loop. */
  loop?: boolean
  /** 0–1: prompt adherence (high) vs creative variation (low). */
  promptInfluence?: number
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
  /** Synchronous audio generation (e.g. Fish Audio — returns audio immediately) */
  generateAudio?(input: ProviderAudioInput): Promise<ProviderAudioResult>
  /**
   * Synchronous sound-effect generation (prompt → one clip). Separate from
   * generateAudio: no voice/emotion, but takes duration/loop/promptInfluence.
   */
  generateSoundEffect?(input: ProviderAudioInput): Promise<ProviderAudioResult>
  /**
   * Synchronous music generation (prompt → track). Separate from speech TTS
   * and SFX (e.g. ElevenLabs POST /v1/music).
   */
  generateMusic?(input: ProviderAudioInput): Promise<ProviderAudioResult>
  /** Async audio queue submission (e.g. FAL F5-TTS) */
  submitAudioToQueue?(
    input: ProviderAudioInput,
  ): Promise<ProviderQueueSubmitResult>
  /** Async audio queue status polling */
  checkAudioQueueStatus?(
    input: ProviderQueueStatusInput,
  ): Promise<ProviderAudioQueueStatusResult>
  healthCheck?(input: HealthCheckInput): Promise<HealthCheckResult>
}
