import 'server-only'

import { z } from 'zod'

import { AI_PROVIDER_ENDPOINTS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { ApiKeyError } from '@/lib/errors'
import { getSystemApiKey } from '@/lib/platform-keys'
import { withRetry } from '@/lib/with-retry'
import {
  findActiveKeyForAdapter,
  getApiKeyValueById,
} from '@/services/apiKey.service'
import { ProviderError } from '@/services/providers/types'
import {
  createImagePreviewAssets,
  fetchAsBuffer,
  generateStorageKey,
  uploadToR2,
} from '@/services/storage/r2'
import { createGeneration } from '@/services/generation.service'
import type { GenerationRecord } from '@/types'

// ─── fal.ai image editing endpoints ──────────────────────────────

/**
 * Default fal.ai model IDs per task. The Workspace's provider picker can
 * override these by passing a specific `modelId` — the legacy callers that
 * omit it fall back to these defaults.
 */
const FAL_DEFAULT_UPSCALE_MODEL = 'fal-ai/aura-sr'
const FAL_CLARITY_UPSCALER_MODEL = 'fal-ai/clarity-upscaler'
const FAL_DEFAULT_REMOVE_BG_MODEL = 'fal-ai/birefnet/v2'
const FAL_DEFAULT_INPAINT_MODEL = 'fal-ai/flux-pro/v1/fill'
const FAL_DEFAULT_OUTPAINT_MODEL = 'fal-ai/image-apps-v2/outpaint'

export type UpscaleTargetScale = '2x' | '4x'

const FalImageEditResponseSchema = z.object({
  image: z.object({
    url: z.string().url(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),
})

const FalImageListEditResponseSchema = z.object({
  images: z
    .array(
      z.object({
        url: z.string().url(),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
      }),
    )
    .min(1),
})

export interface ImageEditResult {
  imageUrl: string
  width: number
  height: number
}

function parseFalImageEditResult(value: unknown): ImageEditResult {
  const result = FalImageEditResponseSchema.safeParse(value)

  if (result.success) {
    return {
      imageUrl: result.data.image.url,
      width: result.data.image.width,
      height: result.data.image.height,
    }
  }

  const listResult = FalImageListEditResponseSchema.safeParse(value)
  if (listResult.success) {
    const image = listResult.data.images[0]
    return {
      imageUrl: image.url,
      width: image.width,
      height: image.height,
    }
  }

  throw new ProviderError('fal.ai', 502, 'Malformed image edit response')
}

async function postFalImageEdit(
  model: string,
  apiKey: string,
  body: Record<string, unknown>,
  label: string,
): Promise<ImageEditResult> {
  const endpoint = `${AI_PROVIDER_ENDPOINTS.FAL}/${model}`

  return await withRetry(
    async () => {
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
        throw new ProviderError('fal.ai', response.status, errorBody)
      }

      return parseFalImageEditResult(await response.json())
    },
    { label, maxAttempts: 3, baseDelayMs: 1000 },
  )
}

/**
 * Resolve which fal model to call for an upscale request. `modelId` wins when
 * the caller picked one explicitly; otherwise `targetScale` decides between
 * Aura SR (4x, fixed) and Clarity Upscaler (configurable, defaulted to 2x).
 */
function resolveUpscaleModel(
  modelId: string | undefined,
  targetScale: UpscaleTargetScale | undefined,
): string {
  if (modelId) return modelId
  if (targetScale === '2x') return FAL_CLARITY_UPSCALER_MODEL
  return FAL_DEFAULT_UPSCALE_MODEL
}

/**
 * Upscale an image. Aura SR uses its fixed 4x pipeline; Clarity Upscaler reads
 * `scale_factor` so 2x output is possible.
 */
export async function upscaleImage(
  imageUrl: string,
  apiKey: string,
  modelId?: string,
  targetScale?: UpscaleTargetScale,
): Promise<ImageEditResult> {
  const resolvedModel = resolveUpscaleModel(modelId, targetScale)
  const endpoint = `${AI_PROVIDER_ENDPOINTS.FAL}/${resolvedModel}`
  const body: Record<string, unknown> = { image_url: imageUrl }
  if (resolvedModel === FAL_CLARITY_UPSCALER_MODEL) {
    body.scale_factor = targetScale === '4x' ? 4 : 2
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
    throw new ProviderError('fal.ai', response.status, errorBody)
  }

  return parseFalImageEditResult(await response.json())
}

/**
 * Remove background using a fal.ai matting model. Defaults to BiRefNet V2.
 */
export async function removeBackground(
  imageUrl: string,
  apiKey: string,
  modelId: string = FAL_DEFAULT_REMOVE_BG_MODEL,
): Promise<ImageEditResult> {
  const endpoint = `${AI_PROVIDER_ENDPOINTS.FAL}/${modelId}`
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
 * Inpaint an image by regenerating the masked region. Defaults to FLUX Pro Fill.
 */
export async function inpaintImage(params: {
  imageUrl: string
  maskImageUrl: string
  prompt: string
  apiKey: string
  negativePrompt?: string
  modelId?: string
}): Promise<ImageEditResult> {
  return await postFalImageEdit(
    params.modelId ?? FAL_DEFAULT_INPAINT_MODEL,
    params.apiKey,
    {
      image_url: params.imageUrl,
      mask_url: params.maskImageUrl,
      prompt: params.prompt,
      ...(params.negativePrompt && {
        negative_prompt: params.negativePrompt,
      }),
    },
    'fal.inpaintImage',
  )
}

/**
 * Outpaint an image by asking fal.ai to expand selected edges. Defaults to
 * the image-apps-v2 outpaint pipeline.
 */
export async function outpaintImage(params: {
  imageUrl: string
  padding: { top: number; right: number; bottom: number; left: number }
  prompt: string
  apiKey: string
  negativePrompt?: string
  modelId?: string
}): Promise<ImageEditResult> {
  const prompt = params.negativePrompt
    ? `${params.prompt}. Avoid: ${params.negativePrompt}`
    : params.prompt

  return await postFalImageEdit(
    params.modelId ?? FAL_DEFAULT_OUTPAINT_MODEL,
    params.apiKey,
    {
      image_url: params.imageUrl,
      expand_top: params.padding.top,
      expand_right: params.padding.right,
      expand_bottom: params.padding.bottom,
      expand_left: params.padding.left,
      prompt,
      num_images: 1,
      output_format: 'png',
      sync_mode: true,
    },
    'fal.outpaintImage',
  )
}

export async function resolveFalImageEditApiKey(
  userId: string,
  apiKeyId?: string,
): Promise<string> {
  if (apiKeyId) {
    const selectedApiKey = await getApiKeyValueById(apiKeyId, userId)

    if (
      !selectedApiKey ||
      selectedApiKey.adapterType !== AI_ADAPTER_TYPES.FAL
    ) {
      throw new ApiKeyError(
        'invalid',
        'Selected API key is unavailable for fal.ai image editing.',
      )
    }

    return selectedApiKey.keyValue
  }

  const userKeyRecord = await findActiveKeyForAdapter(
    userId,
    AI_ADAPTER_TYPES.FAL,
  )
  const apiKey =
    userKeyRecord?.keyValue ?? getSystemApiKey(AI_ADAPTER_TYPES.FAL)

  if (!apiKey) {
    throw new ApiKeyError(
      'missing',
      'No fal.ai API key available. Add one in API Keys.',
    )
  }

  return apiKey
}

/**
 * Persist an edited image (upscale/remove-bg) result to R2 and create a Generation record.
 */
export async function persistEditedImage(params: {
  userId: string
  resultUrl: string
  sourceGenerationId?: string | null
  action: 'upscale' | 'remove-bg' | 'inpaint' | 'outpaint'
  width: number
  height: number
}): Promise<GenerationRecord> {
  const storageKey = generateStorageKey('IMAGE', params.userId)
  const { buffer, mimeType } = await fetchAsBuffer(params.resultUrl)
  const [permanentUrl, previewAssets] = await Promise.all([
    uploadToR2({
      data: buffer,
      key: storageKey,
      mimeType,
    }),
    createImagePreviewAssets({
      sourceBuffer: buffer,
      sourceStorageKey: storageKey,
    }),
  ])

  return createGeneration({
    url: permanentUrl,
    storageKey,
    mimeType,
    thumbnailUrl: previewAssets.thumbnailUrl,
    thumbnailStorageKey: previewAssets.thumbnailStorageKey,
    previewUrl: previewAssets.previewUrl,
    previewStorageKey: previewAssets.previewStorageKey,
    width: params.width,
    height: params.height,
    prompt: params.sourceGenerationId
      ? `[${params.action}] from generation ${params.sourceGenerationId}`
      : `[${params.action}] from external image`,
    model: params.action,
    provider: AI_ADAPTER_TYPES.FAL,
    requestCount: 0,
    userId: params.userId,
  })
}
