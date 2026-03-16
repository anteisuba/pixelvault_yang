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

export interface ProviderAdapter {
  readonly adapterType: AI_ADAPTER_TYPES
  generateImage(
    input: ProviderGenerationInput,
  ): Promise<ProviderGenerationResult>
}
