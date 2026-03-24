import 'server-only'

import {
  API_USAGE,
  AI_PROVIDER_ENDPOINTS,
  IMAGE_SIZES,
} from '@/constants/config'
import { getExecutionModelId } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

import type {
  HealthCheckInput,
  ProviderAdapter,
  ProviderGenerationInput,
} from '@/services/providers/types'

export const huggingFaceAdapter: ProviderAdapter = {
  adapterType: AI_ADAPTER_TYPES.HUGGINGFACE,
  async generateImage({
    prompt,
    modelId,
    aspectRatio,
    providerConfig,
    apiKey,
    referenceImage,
  }: ProviderGenerationInput) {
    const { width, height } = IMAGE_SIZES[aspectRatio] ?? IMAGE_SIZES['1:1']
    const baseUrl = providerConfig.baseUrl || AI_PROVIDER_ENDPOINTS.HUGGINGFACE
    const endpoint = `${baseUrl}/${getExecutionModelId(modelId)}`
    const body: Record<string, unknown> = {
      inputs: prompt,
      parameters: { width, height },
    }

    if (referenceImage) {
      body.image = referenceImage
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error')
      throw new Error(
        `HuggingFace API error (${response.status}): ${errorBody}`,
      )
    }

    const imageBuffer = await response.arrayBuffer()
    const base64 = Buffer.from(imageBuffer).toString('base64')
    const contentType = response.headers.get('content-type') ?? 'image/png'

    return {
      imageUrl: `data:${contentType};base64,${base64}`,
      width,
      height,
      requestCount: API_USAGE.DEFAULT_REQUESTS_PER_GENERATION,
    }
  },

  async healthCheck({ modelId, apiKey, baseUrl, timeoutMs }: HealthCheckInput) {
    const start = Date.now()
    try {
      const endpoint = `${baseUrl}/${modelId}`
      const response = await fetch(endpoint, {
        method: 'HEAD',
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(timeoutMs),
      })
      const latencyMs = Date.now() - start
      if (response.ok || response.status === 405) {
        return { status: 'available' as const, latencyMs }
      }
      return {
        status: 'unavailable' as const,
        latencyMs,
        error: `HTTP ${response.status}`,
      }
    } catch (err) {
      return {
        status: 'unavailable' as const,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : 'Unknown error',
      }
    }
  },
}
