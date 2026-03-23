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

import type {
  ProviderAdapter,
  ProviderGenerationInput,
  ProviderVideoInput,
  ProviderQueueSubmitInput,
  ProviderQueueStatusInput,
} from '@/services/providers/types'

const FAL_RESPONSE_SCHEMA = z.object({
  images: z.array(
    z.object({
      url: z.string().url(),
      width: z.number().int().positive().optional(),
      height: z.number().int().positive().optional(),
      content_type: z.string().optional(),
    }),
  ),
})

const FAL_VIDEO_RESPONSE_SCHEMA = z.object({
  video: z.object({
    url: z.string().url(),
    content_type: z.string().optional(),
    file_name: z.string().optional(),
    file_size: z.number().optional(),
  }),
  thumbnail: z
    .object({
      url: z.string().url(),
      content_type: z.string().optional(),
    })
    .optional()
    .nullable(),
})

const FAL_QUEUE_SUBMIT_SCHEMA = z.object({
  request_id: z.string(),
})

const FAL_QUEUE_STATUS_SCHEMA = z.object({
  status: z.enum(['IN_QUEUE', 'IN_PROGRESS', 'COMPLETED']),
  response_url: z.string().url().optional(),
})

const FAL_IMAGE_SIZES: Record<string, string> = {
  '1:1': 'square_hd',
  '16:9': 'landscape_16_9',
  '9:16': 'portrait_16_9',
  '4:3': 'landscape_4_3',
  '3:4': 'portrait_4_3',
}

export const falAdapter: ProviderAdapter = {
  adapterType: AI_ADAPTER_TYPES.FAL,
  async generateImage({
    prompt,
    modelId,
    aspectRatio,
    providerConfig,
    apiKey,
    referenceImage,
  }: ProviderGenerationInput) {
    const { width, height } = IMAGE_SIZES[aspectRatio] ?? IMAGE_SIZES['1:1']
    const baseUrl = providerConfig.baseUrl || AI_PROVIDER_ENDPOINTS.FAL
    const externalModelId = getExecutionModelId(modelId)
    const endpoint = `${baseUrl}/${externalModelId}`

    const body: Record<string, unknown> = {
      prompt,
      image_size: FAL_IMAGE_SIZES[aspectRatio] ?? 'square_hd',
      num_images: 1,
    }

    if (referenceImage) {
      const dataUrlMatch = referenceImage.match(/^data:([^;]+);base64,(.+)$/)
      if (dataUrlMatch) {
        body.image_url = referenceImage
      } else {
        body.image_url = referenceImage
      }
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error')
      throw new Error(`fal.ai API error (${response.status}): ${errorBody}`)
    }

    const data = FAL_RESPONSE_SCHEMA.parse(await response.json())
    const imageItem = data.images[0]

    if (!imageItem) {
      throw new Error('No image data returned from fal.ai')
    }

    return {
      imageUrl: imageItem.url,
      width: imageItem.width ?? width,
      height: imageItem.height ?? height,
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
    const baseUrl = providerConfig.baseUrl || AI_PROVIDER_ENDPOINTS.FAL
    const externalModelId = getExecutionModelId(modelId)
    const endpoint = `${baseUrl}/${externalModelId}`

    const body: Record<string, unknown> = {
      prompt,
      aspect_ratio: aspectRatio.replace(':', ':'),
      duration: String(duration ?? VIDEO_GENERATION.DEFAULT_DURATION),
    }

    if (referenceImage) {
      body.image_url = referenceImage
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs ?? 180_000)

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Key ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'Unknown error')
        throw new Error(
          `fal.ai video API error (${response.status}): ${errorBody}`,
        )
      }

      const data = FAL_VIDEO_RESPONSE_SCHEMA.parse(await response.json())

      return {
        videoUrl: data.video.url,
        thumbnailUrl: data.thumbnail?.url,
        width,
        height,
        duration: duration ?? VIDEO_GENERATION.DEFAULT_DURATION,
        requestCount: API_USAGE.DEFAULT_REQUESTS_PER_GENERATION,
      }
    } finally {
      clearTimeout(timeout)
    }
  },

  async submitVideoToQueue({
    prompt,
    modelId,
    aspectRatio,
    providerConfig,
    apiKey,
    duration,
    referenceImage,
  }: ProviderQueueSubmitInput) {
    const baseUrl = providerConfig.baseUrl || AI_PROVIDER_ENDPOINTS.FAL_QUEUE
    const externalModelId = getExecutionModelId(modelId)
    const endpoint = `${AI_PROVIDER_ENDPOINTS.FAL_QUEUE}/${externalModelId}`

    const body: Record<string, unknown> = {
      prompt,
      aspect_ratio: aspectRatio.replace(':', ':'),
      duration: String(duration ?? VIDEO_GENERATION.DEFAULT_DURATION),
    }

    if (referenceImage) {
      body.image_url = referenceImage
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error')
      throw new Error(
        `fal.ai queue submit error (${response.status}): ${errorBody}`,
      )
    }

    const data = FAL_QUEUE_SUBMIT_SCHEMA.parse(await response.json())
    return { requestId: data.request_id }
  },

  async checkVideoQueueStatus({
    modelId,
    requestId,
    apiKey,
  }: ProviderQueueStatusInput) {
    const externalModelId = getExecutionModelId(modelId)
    const statusEndpoint = `${AI_PROVIDER_ENDPOINTS.FAL_QUEUE}/${externalModelId}/requests/${requestId}/status`

    const statusResponse = await fetch(statusEndpoint, {
      headers: { Authorization: `Key ${apiKey}` },
    })

    if (!statusResponse.ok) {
      const errorBody = await statusResponse.text().catch(() => 'Unknown error')
      throw new Error(
        `fal.ai queue status error (${statusResponse.status}): ${errorBody}`,
      )
    }

    const statusData = FAL_QUEUE_STATUS_SCHEMA.parse(
      await statusResponse.json(),
    )

    if (statusData.status !== 'COMPLETED') {
      return { status: statusData.status as 'IN_QUEUE' | 'IN_PROGRESS' }
    }

    // Fetch the actual result
    const resultEndpoint = `${AI_PROVIDER_ENDPOINTS.FAL_QUEUE}/${externalModelId}/requests/${requestId}`
    const resultResponse = await fetch(resultEndpoint, {
      headers: { Authorization: `Key ${apiKey}` },
    })

    if (!resultResponse.ok) {
      const errorBody = await resultResponse.text().catch(() => 'Unknown error')
      throw new Error(
        `fal.ai queue result error (${resultResponse.status}): ${errorBody}`,
      )
    }

    const resultData = FAL_VIDEO_RESPONSE_SCHEMA.parse(
      await resultResponse.json(),
    )
    const { width, height } = IMAGE_SIZES['16:9']

    return {
      status: 'COMPLETED' as const,
      result: {
        videoUrl: resultData.video.url,
        thumbnailUrl: resultData.thumbnail?.url,
        width,
        height,
        duration: VIDEO_GENERATION.DEFAULT_DURATION,
        requestCount: API_USAGE.DEFAULT_REQUESTS_PER_GENERATION,
      },
    }
  },
}
