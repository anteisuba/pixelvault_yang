import type { AspectRatio } from '@/constants/config'
import type { AI_ADAPTER_TYPES, ProviderConfig } from '@/constants/providers'

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
}

export interface ProviderAdapter {
  readonly adapterType: AI_ADAPTER_TYPES
  generateImage(
    input: ProviderGenerationInput,
  ): Promise<ProviderGenerationResult>
  generateVideo?(input: ProviderVideoInput): Promise<ProviderVideoResult>
}
