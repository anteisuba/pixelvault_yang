import 'server-only'

import {
  API_USAGE,
  AI_PROVIDER_ENDPOINTS,
  IMAGE_SIZES,
} from '@/constants/config'
import { getExecutionModelId } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

import { invertReferenceStrength } from '@/lib/utils'

import {
  ProviderError,
  type HealthCheckInput,
  type ProviderAdapter,
  type ProviderGenerationInput,
} from '@/services/providers/types'

import { logger } from '@/lib/logger'

export const huggingFaceAdapter: ProviderAdapter = {
  adapterType: AI_ADAPTER_TYPES.HUGGINGFACE,
  async generateImage({
    prompt,
    modelId,
    aspectRatio,
    providerConfig,
    apiKey,
    referenceImage,
    advancedParams,
  }: ProviderGenerationInput) {
    const { width, height } = IMAGE_SIZES[aspectRatio] ?? IMAGE_SIZES['1:1']
    const baseUrl = providerConfig.baseUrl || AI_PROVIDER_ENDPOINTS.HUGGINGFACE
    const endpoint = `${baseUrl}/${getExecutionModelId(modelId)}`
    const params: Record<string, unknown> = { width, height }

    if (advancedParams?.negativePrompt) {
      params.negative_prompt = advancedParams.negativePrompt
    }
    if (advancedParams?.guidanceScale != null) {
      params.guidance_scale = advancedParams.guidanceScale
    }
    if (advancedParams?.steps != null) {
      params.num_inference_steps = advancedParams.steps
    }
    if (advancedParams?.seed != null && advancedParams.seed >= 0) {
      params.seed = advancedParams.seed
    }

    const body: Record<string, unknown> = {
      inputs: prompt,
      parameters: params,
    }

    if (referenceImage) {
      body.image = referenceImage
      // HuggingFace `strength` = denoising (higher = more change)
      // Our `referenceStrength` = similarity (higher = more similar)
      if (advancedParams?.referenceStrength != null) {
        params.strength = invertReferenceStrength(
          advancedParams.referenceStrength,
        )
      }
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
      logger.error('HuggingFace generateImage failed', {
        status: response.status,
        modelId,
        endpoint,
        errorBody: errorBody.slice(0, 500),
      })
      throw new ProviderError('HuggingFace', response.status, errorBody)
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
