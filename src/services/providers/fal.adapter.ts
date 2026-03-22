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
}
