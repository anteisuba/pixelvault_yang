import 'server-only'

import { AI_PROVIDER_ENDPOINTS } from '@/constants/config'
import { ProviderError } from '@/services/providers/types'

// ─── fal.ai image editing endpoints ──────────────────────────────

const FAL_UPSCALE_MODEL = 'fal-ai/aura-sr'
const FAL_REMOVE_BG_MODEL = 'fal-ai/birefnet/v2'

interface ImageEditResult {
  imageUrl: string
  width: number
  height: number
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

  const data = (await response.json()) as {
    image: { url: string; width: number; height: number }
  }

  return {
    imageUrl: data.image.url,
    width: data.image.width,
    height: data.image.height,
  }
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

  const data = (await response.json()) as {
    image: { url: string; width: number; height: number }
  }

  return {
    imageUrl: data.image.url,
    width: data.image.width,
    height: data.image.height,
  }
}
