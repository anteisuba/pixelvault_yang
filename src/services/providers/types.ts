import 'server-only'

import type { AspectRatio } from '@/constants/config'
import type { VideoDefaults } from '@/constants/models'
import type { AI_ADAPTER_TYPES, ProviderConfig } from '@/constants/providers'
import type { VideoResolution } from '@/constants/video-options'
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
  duration?: number
  referenceImage?: string
  negativePrompt?: string
  resolution?: VideoResolution
  i2vModelId?: string
  videoDefaults?: VideoDefaults
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

  constructor(provider: string, status: number, detail: string) {
    super(humanizeProviderError(provider, status, detail))
    this.name = 'ProviderError'
    this.status = status
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
      /billing|credit|payment/i,
      `${provider} account has insufficient credits. Please top up your account.`,
    ],
    [
      /unauthorized|invalid.*key|auth/i,
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
  if (status === 502 || status === 503) {
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
  speed?: number
  format?: string
  sampleRate?: number
}

export interface ProviderAudioResult {
  audioUrl: string
  duration: number
  format: string
  sampleRate: number
  requestCount: number
}

export interface ProviderAudioQueueStatusResult {
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'
  result?: ProviderAudioResult
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
  healthCheck?(input: HealthCheckInput): Promise<HealthCheckResult>
}
