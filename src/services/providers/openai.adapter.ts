import 'server-only'

import { z } from 'zod'

import {
  API_USAGE,
  AI_PROVIDER_ENDPOINTS,
  VIDEO_GENERATION,
} from '@/constants/config'
import { getExecutionModelId } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { fetchAsBuffer } from '@/services/storage/r2'

import type {
  HealthCheckInput,
  ProviderAdapter,
  ProviderGenerationInput,
  ProviderQueueSubmitInput,
  ProviderQueueStatusInput,
} from '@/services/providers/types'

const OPENAI_IMAGE_RESPONSE_SCHEMA = z.object({
  data: z.array(
    z.object({
      b64_json: z.string().min(1).optional(),
      url: z.string().url().optional(),
    }),
  ),
})

const OPENAI_VIDEO_SUBMIT_SCHEMA = z.object({
  id: z.string(),
  status: z.string(),
})

const OPENAI_VIDEO_STATUS_SCHEMA = z.object({
  id: z.string(),
  status: z.enum(['queued', 'in_progress', 'completed', 'failed']),
})

/** Map aspect ratios to OpenAI Sora size format (WxH) */
const OPENAI_VIDEO_SIZES: Record<string, string> = {
  '1:1': '1024x1024',
  '16:9': '1280x720',
  '9:16': '720x1280',
  '4:3': '1024x768',
  '3:4': '768x1024',
}

/** Map our duration values to Sora's allowed seconds (4, 8, 12, 16, 20) — must be string */
function toSoraDuration(duration?: number): string {
  if (!duration || duration <= 4) return '4'
  if (duration <= 8) return '8'
  if (duration <= 12) return '12'
  if (duration <= 16) return '16'
  return '20'
}

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

  async submitVideoToQueue({
    prompt,
    modelId,
    aspectRatio,
    apiKey,
    duration,
    referenceImage,
  }: ProviderQueueSubmitInput) {
    const endpoint = AI_PROVIDER_ENDPOINTS.OPENAI_VIDEO
    const externalModelId = getExecutionModelId(modelId)
    const size = OPENAI_VIDEO_SIZES[aspectRatio] ?? OPENAI_VIDEO_SIZES['16:9']

    const body: Record<string, unknown> = {
      model: externalModelId,
      prompt,
      size,
      seconds: toSoraDuration(duration),
    }

    if (referenceImage) {
      body.input_reference = { image_url: referenceImage }
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
        `OpenAI video submit error (${response.status}): ${errorBody}`,
      )
    }

    const data = OPENAI_VIDEO_SUBMIT_SCHEMA.parse(await response.json())
    const statusUrl = `${AI_PROVIDER_ENDPOINTS.OPENAI_VIDEO}/${data.id}`

    return {
      requestId: data.id,
      statusUrl,
      responseUrl: statusUrl,
    }
  },

  async checkVideoQueueStatus({ statusUrl, apiKey }: ProviderQueueStatusInput) {
    const response = await fetch(statusUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error')
      throw new Error(
        `OpenAI video status error (${response.status}): ${errorBody}`,
      )
    }

    const data = OPENAI_VIDEO_STATUS_SCHEMA.parse(await response.json())

    if (data.status === 'failed') {
      return { status: 'FAILED' as const }
    }

    if (data.status !== 'completed') {
      const mapped =
        data.status === 'queued' ? 'IN_QUEUE' : ('IN_PROGRESS' as const)
      return { status: mapped }
    }

    // Sora returns video content at GET /v1/videos/{id}/content
    const contentUrl = `${statusUrl}/content`

    return {
      status: 'COMPLETED' as const,
      result: {
        videoUrl: contentUrl,
        width: 1280,
        height: 720,
        duration: VIDEO_GENERATION.DEFAULT_DURATION,
        requestCount: API_USAGE.DEFAULT_REQUESTS_PER_GENERATION,
        fetchHeaders: { Authorization: `Bearer ${apiKey}` },
      },
    }
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
