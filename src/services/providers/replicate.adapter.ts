import 'server-only'

import { z } from 'zod'

import {
  API_USAGE,
  AI_PROVIDER_ENDPOINTS,
  IMAGE_SIZES,
} from '@/constants/config'
import { getExecutionModelId } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

import type {
  ProviderAdapter,
  ProviderGenerationInput,
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
const POLL_TIMEOUT_MS = 60000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function pollPrediction(
  predictionUrl: string,
  apiKey: string,
): Promise<z.infer<typeof REPLICATE_PREDICTION_SCHEMA>> {
  const startTime = Date.now()
  let delay = POLL_INITIAL_DELAY_MS

  while (Date.now() - startTime < POLL_TIMEOUT_MS) {
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

  throw new Error('Replicate prediction timed out after 60s')
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
  }: ProviderGenerationInput) {
    const { width, height } = IMAGE_SIZES[aspectRatio] ?? IMAGE_SIZES['1:1']
    const baseUrl = providerConfig.baseUrl || AI_PROVIDER_ENDPOINTS.REPLICATE
    const endpoint = `${baseUrl}/predictions`
    const externalModelId = getExecutionModelId(modelId)

    const input: Record<string, unknown> = {
      prompt,
      aspect_ratio: REPLICATE_ASPECT_RATIOS[aspectRatio] ?? '1:1',
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
}
