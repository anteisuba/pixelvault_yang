import { computeTieredDimensions } from '../../../../../src/lib/image-output-size'
import type {
  ExecutionEnv,
  FalQueueSubmitResult,
  WorkerImageRunContext,
} from '../../index'
import { reportProviderJobId } from '../../lib/app-bridge'
import {
  isRecord,
  readNumberField,
  readPositiveNumberField,
  readStringField,
} from '../../lib/fields'
import { JSON_CONTENT_TYPE } from '../../lib/http'
import { cancelFalQueueRequest } from '../../lib/provider-cancel'
import {
  getImageLoraInputs,
  getImageReferenceInputs,
  injectCivitaiToken,
  invertReferenceStrength,
  readAdvancedRecord,
} from '../../lib/image-io'
import {
  createGenerationWaitLimitError,
  createProviderNoOutputError,
  createProviderPayloadError,
  createProviderResponseError,
  WorkerProviderError,
} from '../../lib/provider-error'
import { isFalQueueFailureStatus } from './queue'
import { resolveRunCivitaiToken } from '../../lib/app-bridge'
import {
  downloadAndUploadImageArtifactToKey,
  hasCivitaiLora,
} from '../../lib/image-io'
import { RETRY_TWICE } from '../multi-step'
import { imageStepNames, type MultiStepImageDriver } from '../types'

// fal Seedream 4.5's custom `{width, height}` size object requires each
// edge within [1920, 4096] (per fal's model docs) — there is no 1K tier
// here, matching the UI's resolutionOptions: ['2K', '4K'] for this model.
export const FAL_SEEDREAM_RESOLUTION_TARGET_PIXELS: Record<
  '2K' | '4K',
  number
> = {
  '2K': 2560 * 1440,
  '4K': 3840 * 2160,
}

export function falSeedreamTieredSize(
  aspectRatio: string,
  tier: '2K' | '4K',
): { width: number; height: number } {
  return computeTieredDimensions(aspectRatio, {
    targetPixels: FAL_SEEDREAM_RESOLUTION_TARGET_PIXELS[tier],
    edgeStep: 8,
    minEdge: 1920,
    maxEdge: 4096,
  })
}

export const FAL_IMAGE_SIZES: Record<string, string> = {
  '1:1': 'square_hd',
  '16:9': 'landscape_16_9',
  '9:16': 'portrait_16_9',
  '4:3': 'landscape_4_3',
  '3:4': 'portrait_4_3',
}

export const FAL_KONTEXT_SINGLE_IMAGE_MODELS = new Set([
  'fal-ai/flux-pro/kontext',
])

export const FAL_KONTEXT_MULTI_IMAGE_MODELS = new Set([
  'fal-ai/flux-pro/kontext/max/multi',
])

export const FAL_TEXT_TO_IMAGE_ONLY_MODELS = new Set([
  'fal-ai/flux-lora',
  'fal-ai/flux-2-pro',
  'fal-ai/flux-2/flash',
  'ideogram/v4',
  'fal-ai/bytedance/seedream/v4.5/text-to-image',
  'bytedance/seedream/v5/pro/text-to-image',
  'fal-ai/bytedance/seedream/v5/lite/text-to-image',
  'fal-ai/recraft/v4/pro/text-to-image',
  'fal-ai/recraft/v4.1/pro/text-to-image',
])

export const FAL_SEEDREAM_45_MODEL_ID =
  'fal-ai/bytedance/seedream/v4.5/text-to-image'

/**
 * fal 把若干型号拆成纯 T2I 端点 + 真正收参考图的兄弟端点。目录只挂 T2I id，
 * 有参考图时在这里换过去——跟 flux-lora → `/image-to-image` 同一套路。
 * `/edit` 兄弟吃 `image_urls[]`；flux-lora 的 `/image-to-image` 吃单数
 * `image_url` + strength（见 buildFalImageInput）。
 */
export const FAL_IMAGE_REFERENCE_ENDPOINT_BY_T2I: Record<string, string> = {
  'fal-ai/flux-lora': 'fal-ai/flux-lora/image-to-image',
  'fal-ai/flux-2-pro': 'fal-ai/flux-2-pro/edit',
  'fal-ai/flux-2/flash': 'fal-ai/flux-2/flash/edit',
  'bytedance/seedream/v5/pro/text-to-image': 'bytedance/seedream/v5/pro/edit',
  'fal-ai/bytedance/seedream/v5/lite/text-to-image':
    'fal-ai/bytedance/seedream/v5/lite/edit',
}

export const FAL_NATIVE_IMAGE_URLS_ENDPOINTS = new Set([
  ...FAL_KONTEXT_MULTI_IMAGE_MODELS,
  ...Object.values(FAL_IMAGE_REFERENCE_ENDPOINT_BY_T2I).filter((id) =>
    id.endsWith('/edit'),
  ),
])

/**
 * 实际要打的 fal 端点 id。有参考图时按 FAL_IMAGE_REFERENCE_ENDPOINT_BY_T2I
 * 换到 edit / i2i 变体。请求体构造和 URL 拼接两处都得用它，所以抽出来。
 */
export function resolveFalImageModelId(context: WorkerImageRunContext): string {
  const { externalModelId } = context.providerInput
  if (getImageReferenceInputs(context).length === 0) return externalModelId
  return FAL_IMAGE_REFERENCE_ENDPOINT_BY_T2I[externalModelId] ?? externalModelId
}

export function buildFalImageInput(
  context: WorkerImageRunContext,
  civitaiToken: string | null = null,
): Record<string, unknown> {
  const { providerInput } = context
  const advancedParams = readAdvancedRecord(context)
  const resolution = readStringField(advancedParams, 'resolution')
  // Seedream 4.5 accepts a custom {width, height} object for 2K/4K output;
  // every other fal model keeps the existing aspect-only preset enum, and
  // Seedream itself keeps that same enum until the user actually picks a
  // resolution tier (no default-behavior change).
  const seedreamTier =
    providerInput.externalModelId === FAL_SEEDREAM_45_MODEL_ID &&
    (resolution === '2K' || resolution === '4K')
      ? resolution
      : null
  const input: Record<string, unknown> = {
    prompt: providerInput.prompt,
    image_size: seedreamTier
      ? falSeedreamTieredSize(providerInput.aspectRatio, seedreamTier)
      : (FAL_IMAGE_SIZES[providerInput.aspectRatio] ?? 'square_hd'),
    num_images: 1,
  }

  const negativePrompt = readStringField(advancedParams, 'negativePrompt')
  if (negativePrompt) input.negative_prompt = negativePrompt

  const guidanceScale = readNumberField(advancedParams, 'guidanceScale')
  if (guidanceScale != null) input.guidance_scale = guidanceScale

  const steps = readPositiveNumberField(advancedParams, 'steps')
  if (steps != null) input.num_inference_steps = steps

  const seed = readNumberField(advancedParams, 'seed')
  if (seed != null && seed >= 0) input.seed = Math.round(seed)

  const loras = getImageLoraInputs(context)
  if (loras.length > 0) {
    input.loras = loras.map((lora) => ({
      path: injectCivitaiToken(lora.url, civitaiToken),
      scale: lora.scale ?? 1,
    }))
  }

  const externalModelId = resolveFalImageModelId(context)
  const refs = getImageReferenceInputs(context)
  if (FAL_NATIVE_IMAGE_URLS_ENDPOINTS.has(externalModelId)) {
    if (refs.length) input.image_urls = refs
  } else if (FAL_KONTEXT_SINGLE_IMAGE_MODELS.has(externalModelId)) {
    const referenceImage = refs[0]
    if (referenceImage) input.image_url = referenceImage
  } else if (!FAL_TEXT_TO_IMAGE_ONLY_MODELS.has(externalModelId)) {
    const referenceImage = refs[0]
    if (referenceImage) {
      input.image_url = referenceImage
      const referenceStrength = readNumberField(
        advancedParams,
        'referenceStrength',
      )
      if (referenceStrength != null) {
        input.strength = invertReferenceStrength(referenceStrength)
      }
    }
  }

  return input
}

export async function submitFalImageQueue(
  context: WorkerImageRunContext,
  apiKey: string,
  env: ExecutionEnv,
  civitaiToken: string | null = null,
): Promise<FalQueueSubmitResult> {
  const endpointModelId = resolveFalImageModelId(context)
  const response = await fetch(`https://queue.fal.run/${endpointModelId}`, {
    method: 'POST',
    headers: {
      Authorization: `Key ${apiKey}`,
      'Content-Type': JSON_CONTENT_TYPE,
    },
    body: JSON.stringify(buildFalImageInput(context, civitaiToken)),
  })

  if (!response.ok) {
    throw await createProviderResponseError(response, {
      provider: 'fal',
      phase: 'image_queue_submit',
      fallbackMessage: `fal.ai image queue submit failed with status ${response.status}`,
    })
  }

  const data = (await response.json()) as Record<string, unknown>
  const submitFailure = createProviderPayloadError(data, {
    provider: 'fal',
    phase: 'image_queue_submit',
    fallbackMessage: 'fal.ai image queue submit reported failure.',
  })
  if (submitFailure) throw submitFailure

  const requestId = readStringField(data, 'request_id')
  const statusUrl = readStringField(data, 'status_url')
  const responseUrl = readStringField(data, 'response_url')

  if (!requestId || !statusUrl || !responseUrl) {
    throw new Error('fal.ai image queue submit returned an invalid response.')
  }

  // Same shape the video path reports: fal's cancel endpoint is per-model
  // (PUT https://queue.fal.run/{model_id}/requests/{request_id}/cancel), so
  // `providerJobId` must carry the whole `{model_id}/requests/{request_id}`
  // path segment cancelProviderJob concatenates.
  await reportProviderJobId(
    env,
    context,
    `${endpointModelId}/requests/${requestId}`,
  )

  return { requestId, statusUrl, responseUrl }
}

export async function pollFalImageQueue(
  queue: FalQueueSubmitResult,
  apiKey: string,
): Promise<FalImageResult> {
  const statusResponse = await fetch(queue.statusUrl, {
    headers: { Authorization: `Key ${apiKey}` },
  })

  if (!statusResponse.ok) {
    throw await createProviderResponseError(statusResponse, {
      provider: 'fal',
      phase: 'image_status_poll',
      fallbackMessage: `fal.ai image status poll failed with status ${statusResponse.status}`,
      requestId: queue.requestId,
    })
  }

  const statusData = (await statusResponse.json()) as Record<string, unknown>
  const status = readStringField(statusData, 'status')
  const statusFailure = createProviderPayloadError(statusData, {
    provider: 'fal',
    phase: 'image_status_poll',
    fallbackMessage: 'fal.ai image queue reported failed status.',
    requestId: queue.requestId,
    providerMetadata: {
      statusUrl: queue.statusUrl,
      responseUrl: queue.responseUrl,
    },
  })
  if (statusFailure) {
    return {
      status: 'FAILED',
      error: statusFailure.message,
      errorCode: statusFailure.errorCode,
      providerMetadata: statusFailure.providerMetadata,
    }
  }
  if (status && isFalQueueFailureStatus(status)) {
    return {
      status: 'FAILED',
      error: 'fal.ai image queue reported failed status.',
      providerMetadata: {
        requestId: queue.requestId,
        statusUrl: queue.statusUrl,
        responseUrl: queue.responseUrl,
      },
    }
  }
  if (status !== 'COMPLETED') {
    return {
      status: status === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'IN_QUEUE',
      providerMetadata: { requestId: queue.requestId },
    }
  }

  const resultResponse = await fetch(queue.responseUrl, {
    headers: { Authorization: `Key ${apiKey}` },
  })

  if (!resultResponse.ok) {
    throw await createProviderResponseError(resultResponse, {
      provider: 'fal',
      phase: 'image_result_fetch',
      fallbackMessage: `fal.ai image result fetch failed with status ${resultResponse.status}`,
      requestId: queue.requestId,
    })
  }

  const resultData = (await resultResponse.json()) as Record<string, unknown>
  const resultFailure = createProviderPayloadError(resultData, {
    provider: 'fal',
    phase: 'image_result_fetch',
    fallbackMessage: 'fal.ai image result response reported failure.',
    requestId: queue.requestId,
    providerMetadata: {
      statusUrl: queue.statusUrl,
      responseUrl: queue.responseUrl,
    },
  })
  if (resultFailure) {
    return {
      status: 'FAILED',
      error: resultFailure.message,
      errorCode: resultFailure.errorCode,
      providerMetadata: resultFailure.providerMetadata,
    }
  }

  const nsfw = Array.isArray(resultData.has_nsfw_concepts)
    ? resultData.has_nsfw_concepts.some(Boolean)
    : false
  if (nsfw) {
    const moderationError = new WorkerProviderError({
      message: 'fal.ai blocked this image result for NSFW concepts.',
      provider: 'fal',
      phase: 'image_result_fetch',
      errorCode: 'content_filtered',
      requestId: queue.requestId,
      providerMetadata: { moderation: 'nsfw' },
    })
    return {
      status: 'FAILED',
      error: moderationError.message,
      errorCode: moderationError.errorCode,
      providerMetadata: moderationError.providerMetadata,
    }
  }

  const images = Array.isArray(resultData.images) ? resultData.images : []
  const firstImage = images.find(isRecord)
  const imageUrl = firstImage ? readStringField(firstImage, 'url') : null
  if (!imageUrl) {
    throw createProviderNoOutputError({
      provider: 'fal',
      phase: 'image_result_fetch',
      message: 'fal.ai image result response did not include an image URL.',
      requestId: queue.requestId,
      providerMetadata: {
        statusUrl: queue.statusUrl,
        responseUrl: queue.responseUrl,
      },
    })
  }

  const seed = readNumberField(resultData, 'seed')
  return {
    status: 'COMPLETED',
    imageUrl,
    width: firstImage
      ? (readPositiveNumberField(firstImage, 'width') ?? undefined)
      : undefined,
    height: firstImage
      ? (readPositiveNumberField(firstImage, 'height') ?? undefined)
      : undefined,
    mimeType:
      (firstImage ? readStringField(firstImage, 'content_type') : null) ??
      undefined,
    providerMetadata: {
      // 大多数 fal 出图模型回传实际用的种子（官方 OpenAPI 的 Output.seed），带回去记进配方。
      ...(seed != null && seed >= 0 ? { seed } : {}),
      requestId: queue.requestId,
      statusUrl: queue.statusUrl,
      responseUrl: queue.responseUrl,
    },
  }
}

export const FAL_IMAGE_DIMENSIONS: Record<
  string,
  { width: number; height: number }
> = {
  '1:1': { width: 1024, height: 1024 },
  '16:9': { width: 1792, height: 1024 },
  '9:16': { width: 1024, height: 1792 },
  '4:3': { width: 1024, height: 768 },
  '3:4': { width: 768, height: 1024 },
}

export interface FalImageResult {
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'
  imageUrl?: string
  width?: number
  height?: number
  mimeType?: string
  error?: string
  errorCode?: string
  providerMetadata?: Record<string, unknown>
}

export const falImageDriver: MultiStepImageDriver<
  FalQueueSubmitResult,
  FalImageResult,
  FalImageResult & { imageUrl: string }
> = {
  stepNames: imageStepNames('fal'),
  // 三次提交 + 中间等 5s / 10s（步骤内重试，见 lib/submit-once.ts）。
  submitStep: { retries: RETRY_TWICE, timeout: '120 seconds' },
  pollStep: { retries: RETRY_TWICE, timeout: '120 seconds' },
  async submit({ env, context, readApiKey }) {
    const apiKey = await readApiKey()
    const civitaiToken = hasCivitaiLora(context)
      ? await resolveRunCivitaiToken(env, context)
      : null
    return submitFalImageQueue(context, apiKey, env, civitaiToken)
  },
  async poll({ readApiKey }, queue) {
    return pollFalImageQueue(queue, await readApiKey())
  },
  readPoll(polled, _queue, context) {
    if (polled.status === 'FAILED') {
      throw new WorkerProviderError({
        message: polled.error ?? 'fal.ai image generation failed.',
        provider: context.providerId,
        phase: 'image_poll',
        errorCode: polled.errorCode,
        providerMetadata: polled.providerMetadata,
      })
    }
    if (polled.status === 'COMPLETED' && polled.imageUrl) {
      return { state: 'done', value: { ...polled, imageUrl: polled.imageUrl } }
    }
    return { state: 'pending' }
  },
  cancelOnTimeout: async ({ readApiKey }, queue) =>
    cancelFalQueueRequest(queue.statusUrl, await readApiKey()),
  timeoutError: (queue) =>
    createGenerationWaitLimitError({
      provider: 'fal',
      phase: 'image_poll',
      requestId: queue.requestId,
    }),
  upload: {
    step: { retries: RETRY_TWICE, timeout: '120 seconds' },
    run: ({ env, context }, _queue, done) =>
      downloadAndUploadImageArtifactToKey(
        env,
        done.imageUrl,
        done.mimeType ?? 'image/png',
        context.providerInput.outputStorageKey ?? `image/${context.runId}.png`,
      ),
  },
  toResult(_queue, done, uploaded, context) {
    if (!uploaded) throw new Error('fal.ai image upload result is missing.')
    const dimensions = FAL_IMAGE_DIMENSIONS[
      context.providerInput.aspectRatio
    ] ?? { width: 1024, height: 1024 }
    return {
      artifactUrl: uploaded.artifactUrl,
      imageR2Key: uploaded.imageR2Key,
      width: done.width ?? dimensions.width,
      height: done.height ?? dimensions.height,
      mimeType: uploaded.mimeType,
      providerMetadata: done.providerMetadata,
    }
  },
}
