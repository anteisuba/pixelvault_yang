import 'server-only'

import { z } from 'zod'

import { AI_PROVIDER_ENDPOINTS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { ProviderError } from '@/services/providers/types'
import {
  fetchAsBuffer,
  uploadToR2,
  generateStorageKey,
} from '@/services/storage/r2'
import { createGeneration } from '@/services/generation.service'
import type { GenerationRecord } from '@/types'

// ─── fal.ai image editing endpoints ──────────────────────────────

const FAL_UPSCALE_MODEL = 'fal-ai/aura-sr'
const FAL_REMOVE_BG_MODEL = 'fal-ai/birefnet/v2'

const FalImageEditResponseSchema = z.object({
  image: z.object({
    url: z.string().url(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),
})

interface ImageEditResult {
  imageUrl: string
  width: number
  height: number
}

function parseFalImageEditResult(value: unknown): ImageEditResult {
  const result = FalImageEditResponseSchema.safeParse(value)

  if (!result.success) {
    throw new ProviderError('fal.ai', 502, 'Malformed image edit response')
  }

  return {
    imageUrl: result.data.image.url,
    width: result.data.image.width,
    height: result.data.image.height,
  }
}

/**
 * Upscale an image using fal.ai Aura SR (4x super-resolution).
 */
export async function upscaleImage(
  imageUrl: string,
  apiKey: string,
): Promise<ImageEditResult> {
  const endpoint = `${AI_PROVIDER_ENDPOINTS.FAL}/${FAL_UPSCALE_MODEL}`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image_url: imageUrl,
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error')
    throw new ProviderError('fal.ai', response.status, errorBody)
  }

  return parseFalImageEditResult(await response.json())
}

/**
 * Remove background from an image using fal.ai BiRefNet V2.
 */
export async function removeBackground(
  imageUrl: string,
  apiKey: string,
): Promise<ImageEditResult> {
  const endpoint = `${AI_PROVIDER_ENDPOINTS.FAL}/${FAL_REMOVE_BG_MODEL}`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image_url: imageUrl,
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error')
    throw new ProviderError('fal.ai', response.status, errorBody)
  }

  return parseFalImageEditResult(await response.json())
}

/**
 * Persist an edited image (upscale/remove-bg) result to R2 and create a Generation record.
 */
export async function persistEditedImage(params: {
  userId: string
  resultUrl: string
  sourceGenerationId: string
  action: 'upscale' | 'remove-bg'
  width: number
  height: number
}): Promise<GenerationRecord> {
  const storageKey = generateStorageKey('IMAGE', params.userId)
  const { buffer, mimeType } = await fetchAsBuffer(params.resultUrl)
  const permanentUrl = await uploadToR2({
    data: buffer,
    key: storageKey,
    mimeType,
  })

  return createGeneration({
    url: permanentUrl,
    storageKey,
    mimeType,
    width: params.width,
    height: params.height,
    prompt: `[${params.action}] from generation ${params.sourceGenerationId}`,
    model: params.action,
    provider: AI_ADAPTER_TYPES.FAL,
    requestCount: 0,
    userId: params.userId,
  })
}
