import 'server-only'

import { z } from 'zod'

import {
  API_USAGE,
  AI_PROVIDER_ENDPOINTS,
  IMAGE_SIZES,
} from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { fetchAsBuffer } from '@/services/storage/r2'

import type {
  ProviderAdapter,
  ProviderGenerationInput,
} from '@/services/providers/types'

const GEMINI_IMAGE_RESPONSE_SCHEMA = z.object({
  candidates: z
    .array(
      z.object({
        content: z
          .object({
            parts: z.array(
              z.object({
                inlineData: z
                  .object({
                    mimeType: z.string().min(1),
                    data: z.string().min(1),
                  })
                  .optional(),
              }),
            ),
          })
          .optional(),
      }),
    )
    .optional(),
})

const GEMINI_ASPECT_RATIOS = {
  '1:1': '1:1',
  '16:9': '16:9',
  '9:16': '9:16',
  '4:3': '4:3',
  '3:4': '3:4',
} as const

async function getGeminiReferencePart(referenceImage: string) {
  const dataUrlMatch = referenceImage.match(/^data:([^;]+);base64,(.+)$/)

  if (dataUrlMatch) {
    return {
      inlineData: {
        mimeType: dataUrlMatch[1],
        data: dataUrlMatch[2],
      },
    }
  }

  const { buffer, mimeType } = await fetchAsBuffer(referenceImage)

  return {
    inlineData: {
      mimeType,
      data: buffer.toString('base64'),
    },
  }
}

export const geminiAdapter: ProviderAdapter = {
  adapterType: AI_ADAPTER_TYPES.GEMINI,
  async generateImage({
    prompt,
    modelId,
    aspectRatio,
    providerConfig,
    apiKey,
    referenceImage,
  }: ProviderGenerationInput) {
    const { width, height } = IMAGE_SIZES[aspectRatio] ?? IMAGE_SIZES['1:1']
    const baseUrl = providerConfig.baseUrl || AI_PROVIDER_ENDPOINTS.GEMINI
    const endpoint = `${baseUrl}/${modelId}:generateContent`
    const parts: Array<Record<string, unknown>> = [{ text: prompt }]

    if (referenceImage) {
      parts.push(await getGeminiReferencePart(referenceImage))
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: {
            aspectRatio: GEMINI_ASPECT_RATIOS[aspectRatio] ?? '1:1',
          },
        },
      }),
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error')
      throw new Error(`Gemini API error (${response.status}): ${errorBody}`)
    }

    const responseData = GEMINI_IMAGE_RESPONSE_SCHEMA.parse(
      await response.json(),
    )
    const responseParts = responseData.candidates?.[0]?.content?.parts
    const imagePart = responseParts?.find((part) => part.inlineData)

    if (!imagePart?.inlineData) {
      throw new Error('No image data returned from Gemini')
    }

    return {
      imageUrl: `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`,
      width,
      height,
      requestCount: API_USAGE.DEFAULT_REQUESTS_PER_GENERATION,
    }
  },
}
