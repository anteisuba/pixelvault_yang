import type { AspectRatio } from '@/constants/config'
import type { AI_ADAPTER_TYPES, ProviderConfig } from '@/constants/providers'
import type { ModelHealthStatus } from '@/types'

export interface ProviderGenerationInput {
  prompt: string
  modelId: string
  aspectRatio: AspectRatio
  providerConfig: ProviderConfig
  apiKey: string
  referenceImage?: string
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
  resolution?: string
  i2vModelId?: string
  videoDefaults?: Record<string, unknown>
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

export interface ProviderAdapter {
  readonly adapterType: AI_ADAPTER_TYPES
  generateImage(
    input: ProviderGenerationInput,
  ): Promise<ProviderGenerationResult>
  generateVideo?(input: ProviderVideoInput): Promise<ProviderVideoResult>
  submitVideoToQueue?(
    input: ProviderQueueSubmitInput,
  ): Promise<ProviderQueueSubmitResult>
  checkVideoQueueStatus?(
    input: ProviderQueueStatusInput,
  ): Promise<ProviderQueueStatusResult>
  healthCheck?(input: HealthCheckInput): Promise<HealthCheckResult>
}
