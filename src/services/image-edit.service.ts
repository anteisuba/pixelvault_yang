import 'server-only'

import sharp from 'sharp'
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

// ─── Provider routing ───────────────────────────────────────────

type EditProvider = 'fal' | 'openai' | 'gemini'

/**
 * Infer the provider from the model ID's prefix. Used so the dispatcher
 * doesn't have to maintain a hand-written allowlist — every fal.ai model is
 * `fal-ai/…`, every Gemini image model is `gemini-…`, every GPT Image model
 * starts with `gpt-image-…`. Anything else falls back to fal for backwards
 * compatibility with the legacy hardcoded paths.
 */
function providerForModel(modelId: string): EditProvider {
  if (modelId.startsWith('gemini-')) return 'gemini'
  if (modelId.startsWith('gpt-image-')) return 'openai'
  return 'fal'
}

const PROVIDER_TO_ADAPTER: Record<EditProvider, AI_ADAPTER_TYPES> = {
  fal: AI_ADAPTER_TYPES.FAL,
  openai: AI_ADAPTER_TYPES.OPENAI,
  gemini: AI_ADAPTER_TYPES.GEMINI,
}

/**
 * Read the buffer's intrinsic dimensions. Gemini and OpenAI both return
 * base64-encoded image data without surfacing width/height fields, so we lean
 * on sharp's metadata reader (already in use elsewhere in this service).
 */
async function readBufferDimensions(
  buffer: Buffer,
): Promise<{ width: number; height: number }> {
  try {
    const metadata = await sharp(buffer).metadata()
    return {
      width: metadata.width ?? 1024,
      height: metadata.height ?? 1024,
    }
  } catch {
    return { width: 1024, height: 1024 }
  }
}

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
// ─── Gemini Nano Banana Pro (gemini-3-pro-image-preview) ────────

const GeminiEditResponseSchema = z.object({
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

async function inlineImagePart(imageUrl: string): Promise<{
  inlineData: { mimeType: string; data: string }
}> {
  const dataUrlMatch = imageUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (dataUrlMatch) {
    return {
      inlineData: { mimeType: dataUrlMatch[1], data: dataUrlMatch[2] },
    }
  }
  const { buffer, mimeType } = await fetchAsBuffer(imageUrl)
  return {
    inlineData: { mimeType, data: buffer.toString('base64') },
  }
}

/**
 * Conversational edit via Gemini Nano Banana Pro / Flash Image. Gemini doesn't
 * accept a separate mask — the prompt describes what to change. Source image
 * is sent as inlineData, optional references stacked after it.
 */
async function editImageWithGemini(params: {
  modelId: string
  apiKey: string
  imageUrl: string
  prompt: string
  referenceImages?: string[]
}): Promise<ImageEditResult> {
  const endpoint = `${AI_PROVIDER_ENDPOINTS.GEMINI}/${params.modelId}:generateContent`
  const parts: Array<Record<string, unknown>> = [{ text: params.prompt }]
  parts.push(await inlineImagePart(params.imageUrl))
  for (const ref of params.referenceImages ?? []) {
    parts.push(await inlineImagePart(ref))
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'x-goog-api-key': params.apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
    }),
    signal: AbortSignal.timeout(60_000),
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error')
    throw new ProviderError('Gemini', response.status, errorBody)
  }

  const parsed = GeminiEditResponseSchema.parse(await response.json())
  const imagePart = parsed.candidates?.[0]?.content?.parts?.find(
    (p) => p.inlineData,
  )
  if (!imagePart?.inlineData) {
    throw new ProviderError('Gemini', 502, 'No image data returned')
  }

  const buffer = Buffer.from(imagePart.inlineData.data, 'base64')
  const { width, height } = await readBufferDimensions(buffer)
  return {
    imageUrl: `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`,
    width,
    height,
  }
}

// ─── OpenAI gpt-image-2 ─────────────────────────────────────────

const OpenAiEditResponseSchema = z.object({
  data: z.array(
    z.object({
      b64_json: z.string().min(1).optional(),
      url: z.string().url().optional(),
    }),
  ),
})

/**
 * OpenAI image edits via `/v1/images/edits`. Accepts an optional mask (soft
 * mask — the model regenerates the whole image but biases toward the masked
 * area). Returns base64; we re-read the buffer for dimensions.
 */
async function editImageWithOpenAI(params: {
  modelId: string
  apiKey: string
  imageUrl: string
  prompt: string
  maskImageUrl?: string
  referenceImages?: string[]
}): Promise<ImageEditResult> {
  const baseUrl = AI_PROVIDER_ENDPOINTS.OPENAI.replace(/\/$/, '').replace(
    /\/(generations|edits)$/,
    '',
  )
  const endpoint = `${baseUrl}/edits`

  const formData = new FormData()
  formData.append('model', params.modelId)
  formData.append('prompt', params.prompt)
  formData.append('size', '1024x1024')

  const { buffer: imageBuffer, mimeType: imageMime } = await fetchAsBuffer(
    params.imageUrl,
  )
  formData.append(
    'image',
    new Blob([Uint8Array.from(imageBuffer)], { type: imageMime }),
    `source.${imageMime.split('/')[1] ?? 'png'}`,
  )

  // Additional reference images stack as `image[]` per OpenAI's multi-input
  // contract (gpt-image-2 supports multi-reference compositing).
  for (const ref of params.referenceImages ?? []) {
    const { buffer, mimeType } = await fetchAsBuffer(ref)
    formData.append(
      'image[]',
      new Blob([Uint8Array.from(buffer)], { type: mimeType }),
      `ref.${mimeType.split('/')[1] ?? 'png'}`,
    )
  }

  if (params.maskImageUrl) {
    const { buffer: maskBuffer } = await fetchAsBuffer(params.maskImageUrl)
    formData.append(
      'mask',
      new Blob([Uint8Array.from(maskBuffer)], { type: 'image/png' }),
      'mask.png',
    )
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${params.apiKey}` },
    body: formData,
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error')
    throw new ProviderError('OpenAI', response.status, errorBody)
  }

  const parsed = OpenAiEditResponseSchema.parse(await response.json())
  const item = parsed.data[0]

  if (item?.b64_json) {
    const buffer = Buffer.from(item.b64_json, 'base64')
    const { width, height } = await readBufferDimensions(buffer)
    return {
      imageUrl: `data:image/png;base64,${item.b64_json}`,
      width,
      height,
    }
  }
  if (item?.url) {
    const { buffer } = await fetchAsBuffer(item.url)
    const { width, height } = await readBufferDimensions(buffer)
    return { imageUrl: item.url, width, height }
  }

  throw new ProviderError('OpenAI', 502, 'No image data returned')
}

// ─── Inpaint / Outpaint dispatchers ─────────────────────────────

/**
 * Inpaint dispatcher. Routes to fal (mask-based), Gemini (prompt-only,
 * conversational), or OpenAI (`/v1/images/edits` with optional mask).
 */
export async function inpaintImage(params: {
  imageUrl: string
  maskImageUrl: string
  prompt: string
  apiKey: string
  negativePrompt?: string
  modelId?: string
}): Promise<ImageEditResult> {
  const modelId = params.modelId ?? FAL_DEFAULT_INPAINT_MODEL
  const provider = providerForModel(modelId)

  if (provider === 'gemini') {
    return editImageWithGemini({
      modelId,
      apiKey: params.apiKey,
      imageUrl: params.imageUrl,
      prompt: params.prompt,
    })
  }
  if (provider === 'openai') {
    return editImageWithOpenAI({
      modelId,
      apiKey: params.apiKey,
      imageUrl: params.imageUrl,
      prompt: params.prompt,
      maskImageUrl: params.maskImageUrl,
    })
  }

  return await postFalImageEdit(
    modelId,
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

function describeOutpaintDirections(padding: {
  top: number
  right: number
  bottom: number
  left: number
}): string {
  const parts: string[] = []
  if (padding.top > 0) parts.push(`${padding.top}px upward`)
  if (padding.right > 0) parts.push(`${padding.right}px to the right`)
  if (padding.bottom > 0) parts.push(`${padding.bottom}px downward`)
  if (padding.left > 0) parts.push(`${padding.left}px to the left`)
  return parts.length > 0 ? parts.join(', ') : 'on every side'
}

/**
 * Outpaint dispatcher. fal owns the precise per-edge expansion; Gemini gets a
 * prompt-rewrite (its native API has no padding concept) so the model
 * extends the scene as instructed.
 */
export async function outpaintImage(params: {
  imageUrl: string
  padding: { top: number; right: number; bottom: number; left: number }
  prompt: string
  apiKey: string
  negativePrompt?: string
  modelId?: string
}): Promise<ImageEditResult> {
  const modelId = params.modelId ?? FAL_DEFAULT_OUTPAINT_MODEL
  const provider = providerForModel(modelId)
  const prompt = params.negativePrompt
    ? `${params.prompt}. Avoid: ${params.negativePrompt}`
    : params.prompt

  if (provider === 'gemini') {
    const directions = describeOutpaintDirections(params.padding)
    return editImageWithGemini({
      modelId,
      apiKey: params.apiKey,
      imageUrl: params.imageUrl,
      prompt: `Extend this image ${directions}. ${prompt}`.trim(),
    })
  }
  // OpenAI has no native outpaint endpoint — picker hides this combo, so
  // hitting it is a programming error, not a user error.
  if (provider === 'openai') {
    throw new ProviderError(
      'OpenAI',
      400,
      'OpenAI does not support outpaint. Pick fal or Gemini.',
    )
  }

  return await postFalImageEdit(
    modelId,
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

// ─── Element Extraction (text-guided cutout) ────────────────────

const FAL_DEFAULT_EXTRACT_MODEL = 'fal-ai/sam-3/image'
const FAL_EVF_SAM_MODEL = 'fal-ai/evf-sam'
const FAL_LANG_SAM_MODEL = 'fal-ai/lang-segment-anything'
const FAL_BIREFNET_MODEL = 'fal-ai/birefnet/v2'

/** SAM 3 / Lang-SAM share this shape: array of masks (string url or object). */
const FalMaskListSchema = z.object({
  masks: z
    .array(
      z
        .union([z.string().url(), z.object({ url: z.string().url() })])
        .transform((entry) => (typeof entry === 'string' ? entry : entry.url)),
    )
    .min(1),
})

/** EVF-SAM returns a single mask as `image: { url }`. */
const FalSingleImageSchema = z.object({
  image: z.object({ url: z.string().url() }),
})

/** BiRefNet with `output_mask: true` returns the mask separately. */
const FalBirefnetSchema = z.object({
  mask_image: z.object({ url: z.string().url() }),
})

/**
 * Per-model adapter that turns the extract request into the right fal body +
 * parser. Each branch returns the mask URL so the calling function can do the
 * common fetch + sharp composite pipeline.
 */
async function callExtractionModel(
  modelId: string,
  apiKey: string,
  imageUrl: string,
  prompt: string,
): Promise<string> {
  const endpoint = `${AI_PROVIDER_ENDPOINTS.FAL}/${modelId}`

  const body: Record<string, unknown> = (() => {
    if (modelId === FAL_LANG_SAM_MODEL) {
      return { image_url: imageUrl, text_prompt: prompt }
    }
    if (modelId === FAL_EVF_SAM_MODEL) {
      return { image_url: imageUrl, prompt, mask_only: true }
    }
    if (modelId === FAL_BIREFNET_MODEL) {
      return { image_url: imageUrl, output_mask: true }
    }
    // SAM 3 and any future text-prompt models default here.
    return { image_url: imageUrl, prompt }
  })()

  const response = await withRetry(
    async () => {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Key ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const errorBody = await res.text().catch(() => 'Unknown error')
        throw new ProviderError('fal.ai', res.status, errorBody)
      }
      return res.json()
    },
    { label: `fal.extract.${modelId}`, maxAttempts: 3, baseDelayMs: 1000 },
  )

  if (modelId === FAL_EVF_SAM_MODEL) {
    const parsed = FalSingleImageSchema.safeParse(response)
    if (!parsed.success) {
      throw new ProviderError(
        'fal.ai',
        502,
        `Malformed EVF-SAM response: ${parsed.error.message}`,
      )
    }
    return parsed.data.image.url
  }

  if (modelId === FAL_BIREFNET_MODEL) {
    const parsed = FalBirefnetSchema.safeParse(response)
    if (!parsed.success) {
      throw new ProviderError(
        'fal.ai',
        502,
        `Malformed BiRefNet response: ${parsed.error.message}`,
      )
    }
    return parsed.data.mask_image.url
  }

  const parsed = FalMaskListSchema.safeParse(response)
  if (!parsed.success) {
    throw new ProviderError(
      'fal.ai',
      502,
      `Malformed mask-list response from ${modelId}: ${parsed.error.message}`,
    )
  }
  return parsed.data.masks[0]
}

/**
 * Combine the source image and a grayscale mask into a single PNG with the
 * alpha channel driven by the mask. When `invert` is true the alpha is
 * inverted first — that's how the "extract background" preset works (mask
 * comes back as foreground, we want to keep what isn't foreground).
 */
async function applyMaskToImage(
  sourceBuffer: Buffer,
  maskBuffer: Buffer,
  invert: boolean,
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const sourceMeta = await sharp(sourceBuffer).metadata()
  const width = sourceMeta.width ?? 1024
  const height = sourceMeta.height ?? 1024

  // Normalize mask to single-channel, resized to source dims, optionally
  // inverted. dest-in then drops every source pixel whose mask byte is 0.
  let maskPipeline = sharp(maskBuffer)
    .resize(width, height, { fit: 'fill' })
    .greyscale()
    .removeAlpha()
  if (invert) maskPipeline = maskPipeline.negate()
  const alphaMask = await maskPipeline.png().toBuffer()

  const cutoutBuffer = await sharp(sourceBuffer)
    .ensureAlpha()
    .composite([{ input: alphaMask, blend: 'dest-in' }])
    .png()
    .toBuffer()

  return { buffer: cutoutBuffer, width, height }
}

/**
 * Text-guided element extraction. fal lang-segment-anything maps the prompt
 * to a binary mask; we then composite source × mask into a transparent PNG.
 */
export async function extractElement(params: {
  imageUrl: string
  prompt: string
  apiKey: string
  invert?: boolean
  modelId?: string
}): Promise<ImageEditResult> {
  const modelId = params.modelId ?? FAL_DEFAULT_EXTRACT_MODEL

  const maskUrl = await callExtractionModel(
    modelId,
    params.apiKey,
    params.imageUrl,
    params.prompt,
  )

  const [{ buffer: sourceBuffer }, { buffer: maskBuffer }] = await Promise.all([
    fetchAsBuffer(params.imageUrl),
    fetchAsBuffer(maskUrl),
  ])

  const cutout = await applyMaskToImage(
    sourceBuffer,
    maskBuffer,
    params.invert === true,
  )

  // Return as data URL so the route's existing persistEditedImage pipeline
  // (fetchAsBuffer → uploadToR2 → createGeneration) handles persistence the
  // same way it does for fal / Gemini / OpenAI returns.
  return {
    imageUrl: `data:image/png;base64,${cutout.buffer.toString('base64')}`,
    width: cutout.width,
    height: cutout.height,
  }
}

/**
 * Generic API key resolver that picks the right adapter based on `modelId`.
 * Prefer this in new code; `resolveFalImageEditApiKey` stays as a thin alias
 * so legacy callers (the four route files written before Phase 4) compile
 * untouched.
 */
export async function resolveEditApiKey(
  userId: string,
  modelId: string | undefined,
  apiKeyId?: string,
): Promise<string> {
  const provider = providerForModel(modelId ?? '')
  const adapterType = PROVIDER_TO_ADAPTER[provider]

  if (apiKeyId) {
    const selectedApiKey = await getApiKeyValueById(apiKeyId, userId)

    if (!selectedApiKey || selectedApiKey.adapterType !== adapterType) {
      throw new ApiKeyError(
        'invalid',
        `Selected API key is not valid for ${adapterType} image editing.`,
      )
    }

    return selectedApiKey.keyValue
  }

  const userKeyRecord = await findActiveKeyForAdapter(userId, adapterType)
  if (userKeyRecord?.keyValue) {
    return userKeyRecord.keyValue
  }

  // BYOK enforcement: Gemini and OpenAI never fall back to platform keys.
  // The cost would silently land on the project owner — surface a clear
  // "go configure your key" error instead. fal keeps the platform fallback
  // for backwards compatibility with the existing upscale / remove-bg /
  // inpaint / outpaint flows that shipped before Phase 4.
  if (provider === 'fal') {
    const platformKey = getSystemApiKey(adapterType)
    if (platformKey) return platformKey
  }

  throw new ApiKeyError(
    'missing',
    `No ${adapterType} API key configured. Add one in API Keys to use this model.`,
  )
}

/** @deprecated Phase 4: use {@link resolveEditApiKey} with the model ID. */
export async function resolveFalImageEditApiKey(
  userId: string,
  apiKeyId?: string,
): Promise<string> {
  return resolveEditApiKey(userId, FAL_DEFAULT_UPSCALE_MODEL, apiKeyId)
}

/**
 * Persist an edited image (upscale/remove-bg) result to R2 and create a Generation record.
 */
export async function persistEditedImage(params: {
  userId: string
  resultUrl: string
  sourceGenerationId?: string | null
  action: 'upscale' | 'remove-bg' | 'inpaint' | 'outpaint' | 'extract'
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
