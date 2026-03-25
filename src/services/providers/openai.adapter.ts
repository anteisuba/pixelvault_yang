import 'server-only'

import { z } from 'zod'

import { API_USAGE, AI_PROVIDER_ENDPOINTS } from '@/constants/config'
import { getExecutionModelId } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { fetchAsBuffer } from '@/services/storage/r2'

import type {
  HealthCheckInput,
  ProviderAdapter,
  ProviderGenerationInput,
} from '@/services/providers/types'

const OPENAI_IMAGE_RESPONSE_SCHEMA = z.object({
  data: z.array(
    z.object({
      b64_json: z.string().min(1).optional(),
      url: z.string().url().optional(),
    }),
  ),
})

const OPENAI_IMAGE_SIZES = {
  '1:1': { width: 1024, height: 1024, size: '1024x1024' },
  '16:9': { width: 1536, height: 1024, size: '1536x1024' },
  '9:16': { width: 1024, height: 1536, size: '1024x1536' },
  '4:3': { width: 1536, height: 1024, size: '1536x1024' },
  '3:4': { width: 1024, height: 1536, size: '1024x1536' },
} as const

function getOpenAiEndpoint(
  baseUrl: string,
  hasReferenceImage: boolean,
): string {
  const trimmedBaseUrl = baseUrl.replace(/\/$/, '')
  const targetPath = hasReferenceImage ? 'edits' : 'generations'

  if (
    trimmedBaseUrl.endsWith('/generations') ||
    trimmedBaseUrl.endsWith('/edits')
  ) {
    return trimmedBaseUrl.replace(/\/(generations|edits)$/, `/${targetPath}`)
  }

  return `${trimmedBaseUrl}/${targetPath}`
}

export const openAiAdapter: ProviderAdapter = {
  adapterType: AI_ADAPTER_TYPES.OPENAI,
  async generateImage({
    prompt,
    modelId,
    aspectRatio,
    providerConfig,
    apiKey,
    referenceImage,
  }: ProviderGenerationInput) {
    const { width, height, size } =
      OPENAI_IMAGE_SIZES[aspectRatio] ?? OPENAI_IMAGE_SIZES['1:1']
    const baseUrl = providerConfig.baseUrl || AI_PROVIDER_ENDPOINTS.OPENAI
    const endpoint = getOpenAiEndpoint(baseUrl, Boolean(referenceImage))
    let response: Response

    if (referenceImage) {
      const { buffer, mimeType } = await fetchAsBuffer(referenceImage)
      const extension = mimeType.split('/')[1] ?? 'png'
      const formData = new FormData()

      formData.append('model', getExecutionModelId(modelId))
      formData.append('prompt', prompt)
      formData.append('size', size)
      formData.append(
        'image',
        new Blob([Uint8Array.from(buffer)], { type: mimeType }),
        `reference.${extension}`,
      )

      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
      })
    } else {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: getExecutionModelId(modelId),
          prompt,
          size,
        }),
      })
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error')
      throw new Error(`OpenAI API error (${response.status}): ${errorBody}`)
    }

    const responseData = OPENAI_IMAGE_RESPONSE_SCHEMA.parse(
      await response.json(),
    )
    const imageItem = responseData.data[0]

    if (imageItem?.b64_json) {
      return {
        imageUrl: `data:image/png;base64,${imageItem.b64_json}`,
        width,
        height,
        requestCount: API_USAGE.DEFAULT_REQUESTS_PER_GENERATION,
      }
    }

    if (imageItem?.url) {
      return {
        imageUrl: imageItem.url,
        width,
        height,
        requestCount: API_USAGE.DEFAULT_REQUESTS_PER_GENERATION,
      }
    }

    throw new Error('No image data returned from OpenAI')
  },

  async healthCheck({ apiKey, timeoutMs }: HealthCheckInput) {
    const start = Date.now()
    try {
      const response = await fetch('https://api.openai.com/v1/models', {
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
