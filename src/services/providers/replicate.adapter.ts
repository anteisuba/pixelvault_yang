import 'server-only'

import { z } from 'zod'

import {
  API_USAGE,
  AI_PROVIDER_ENDPOINTS,
  IMAGE_SIZES,
  VIDEO_GENERATION,
} from '@/constants/config'
import { getExecutionModelId } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

import { invertReferenceStrength } from '@/lib/utils'

import type {
  HealthCheckInput,
  ProviderAdapter,
  ProviderGenerationInput,
  ProviderVideoInput,
} from '@/services/providers/types'

const REPLICATE_PREDICTION_SCHEMA = z.object({
  id: z.string(),
  status: z.enum(['starting', 'processing', 'succeeded', 'failed', 'canceled']),
  output: z.unknown().optional(),
  error: z.string().nullable().optional(),
})

const REPLICATE_ASPECT_RATIOS: Record<string, string> = {
  '1:1': '1:1',
  '16:9': '16:9',
  '9:16': '9:16',
  '4:3': '4:3',
  '3:4': '3:4',
}

const POLL_INITIAL_DELAY_MS = 1000
const POLL_MAX_DELAY_MS = 8000
const POLL_TIMEOUT_MS = 180_000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function pollPrediction(
  predictionUrl: string,
  apiKey: string,
  timeoutMs: number = POLL_TIMEOUT_MS,
): Promise<z.infer<typeof REPLICATE_PREDICTION_SCHEMA>> {
  const startTime = Date.now()
  let delay = POLL_INITIAL_DELAY_MS

  while (Date.now() - startTime < timeoutMs) {
    await sleep(delay)

    const response = await fetch(predictionUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error')
      throw new Error(`Replicate poll error (${response.status}): ${errorBody}`)
    }

    const prediction = REPLICATE_PREDICTION_SCHEMA.parse(await response.json())

    if (prediction.status === 'succeeded') {
      return prediction
    }

    if (prediction.status === 'failed' || prediction.status === 'canceled') {
      throw new Error(
        `Replicate prediction ${prediction.status}: ${prediction.error ?? 'Unknown error'}`,
      )
    }

    // Exponential backoff
    delay = Math.min(delay * 2, POLL_MAX_DELAY_MS)
  }

  throw new Error(
    `Replicate prediction timed out after ${Math.round(timeoutMs / 1000)}s`,
  )
}

function extractImageUrl(output: unknown): string {
  // Output can be a string URL, an array of URLs, or an object with a url field
  if (typeof output === 'string') return output

  if (Array.isArray(output)) {
    const first = output[0]
    if (typeof first === 'string') return first
    if (first && typeof first === 'object' && 'url' in first) {
      return String((first as { url: unknown }).url)
    }
  }

  if (output && typeof output === 'object' && 'url' in output) {
    return String((output as { url: unknown }).url)
  }

  throw new Error('Could not extract image URL from Replicate output')
}

export const replicateAdapter: ProviderAdapter = {
  adapterType: AI_ADAPTER_TYPES.REPLICATE,
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
    const baseUrl = providerConfig.baseUrl || AI_PROVIDER_ENDPOINTS.REPLICATE
    const endpoint = `${baseUrl}/predictions`
    const externalModelId = getExecutionModelId(modelId)

    const input: Record<string, unknown> = {
      prompt,
      aspect_ratio: REPLICATE_ASPECT_RATIOS[aspectRatio] ?? '1:1',
    }

    if (advancedParams?.negativePrompt) {
      input.negative_prompt = advancedParams.negativePrompt
    }
    if (advancedParams?.guidanceScale != null) {
      input.guidance_scale = advancedParams.guidanceScale
    }
    if (advancedParams?.steps != null) {
      input.num_inference_steps = advancedParams.steps
    }
    if (advancedParams?.seed != null && advancedParams.seed >= 0) {
      input.seed = advancedParams.seed
    }

    if (referenceImage) {
      input.image = referenceImage
      // Replicate `strength` = denoising (higher = more change)
      // Our `referenceStrength` = similarity (higher = more similar)
      if (advancedParams?.referenceStrength != null) {
        input.strength = invertReferenceStrength(
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
      body: JSON.stringify({
        model: externalModelId,
        input,
      }),
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error')
      throw new Error(`Replicate API error (${response.status}): ${errorBody}`)
    }

    const prediction = REPLICATE_PREDICTION_SCHEMA.parse(await response.json())

    // If already succeeded (unlikely but possible)
    if (prediction.status === 'succeeded' && prediction.output) {
      return {
        imageUrl: extractImageUrl(prediction.output),
        width,
        height,
        requestCount: API_USAGE.DEFAULT_REQUESTS_PER_GENERATION,
      }
    }

    // Poll for completion
    const pollUrl = `${baseUrl}/predictions/${prediction.id}`
    const completed = await pollPrediction(pollUrl, apiKey)

    return {
      imageUrl: extractImageUrl(completed.output),
      width,
      height,
      requestCount: API_USAGE.DEFAULT_REQUESTS_PER_GENERATION,
    }
  },

  async generateVideo({
    prompt,
    modelId,
    aspectRatio,
    providerConfig,
    apiKey,
    duration,
    referenceImage,
    timeoutMs,
  }: ProviderVideoInput) {
    const { width, height } = IMAGE_SIZES[aspectRatio] ?? IMAGE_SIZES['16:9']
    const baseUrl = providerConfig.baseUrl || AI_PROVIDER_ENDPOINTS.REPLICATE
    const endpoint = `${baseUrl}/predictions`
    const externalModelId = getExecutionModelId(modelId)

    const input: Record<string, unknown> = {
      prompt,
      aspect_ratio: REPLICATE_ASPECT_RATIOS[aspectRatio] ?? '16:9',
      duration: duration ?? VIDEO_GENERATION.DEFAULT_DURATION,
    }

    if (referenceImage) {
      input.image = referenceImage
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: externalModelId,
        input,
      }),
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error')
      throw new Error(
        `Replicate video API error (${response.status}): ${errorBody}`,
      )
    }

    const prediction = REPLICATE_PREDICTION_SCHEMA.parse(await response.json())

    if (prediction.status === 'succeeded' && prediction.output) {
      return {
        videoUrl: extractImageUrl(prediction.output),
        width,
        height,
        duration: duration ?? VIDEO_GENERATION.DEFAULT_DURATION,
        requestCount: API_USAGE.DEFAULT_REQUESTS_PER_GENERATION,
      }
    }

    const pollUrl = `${baseUrl}/predictions/${prediction.id}`
    const completed = await pollPrediction(
      pollUrl,
      apiKey,
      timeoutMs ?? 180_000,
    )

    return {
      videoUrl: extractImageUrl(completed.output),
      width,
      height,
      duration: duration ?? VIDEO_GENERATION.DEFAULT_DURATION,
      requestCount: API_USAGE.DEFAULT_REQUESTS_PER_GENERATION,
    }
  },

  async healthCheck({ modelId, apiKey, baseUrl, timeoutMs }: HealthCheckInput) {
    const start = Date.now()
    try {
      const [owner, name] = modelId.split('/')
      if (!owner || !name) {
        return {
          status: 'unavailable' as const,
          latencyMs: Date.now() - start,
          error: 'Invalid Replicate model ID format',
        }
      }
      const endpoint = `${baseUrl}/models/${owner}/${name}`
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(timeoutMs),
      })
      const latencyMs = Date.now() - start
      if (response.ok) {
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
