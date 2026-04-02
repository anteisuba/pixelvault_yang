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
    super(`${provider} API error (${status}): ${detail}`)
    this.name = 'ProviderError'
    this.status = status
  }
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
  healthCheck?(input: HealthCheckInput): Promise<HealthCheckResult>
}
