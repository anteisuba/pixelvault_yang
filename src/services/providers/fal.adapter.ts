import 'server-only'

import { z } from 'zod'

import {
  API_USAGE,
  AI_PROVIDER_ENDPOINTS,
  IMAGE_SIZES,
  VIDEO_GENERATION,
} from '@/constants/config'
import { getExecutionModelId, getModelById } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

import { invertReferenceStrength } from '@/lib/utils'
import { logger } from '@/lib/logger'

/**
 * Normalize fal.ai error responses into user-friendly messages.
 * fal.ai returns FastAPI validation errors with a `detail: [{ type, msg, ... }]` shape;
 * the most common non-HTTP error is content_policy_violation.
 */
function formatFalError(status: number, errorBody: string): string {
  let parsed: unknown = null
  try {
    parsed = JSON.parse(errorBody)
  } catch {
    // not JSON
  }
  const detail =
    parsed && typeof parsed === 'object' && 'detail' in parsed
      ? (parsed as { detail: unknown }).detail
      : undefined
  const firstError =
    Array.isArray(detail) && detail.length > 0
      ? (detail[0] as { type?: unknown; msg?: unknown })
      : undefined
  const type =
    typeof firstError?.type === 'string' ? firstError.type : undefined
  const msg = typeof firstError?.msg === 'string' ? firstError.msg : undefined

  if (type === 'content_policy_violation') {
    return 'fal.ai 内容审核拒绝：生成结果被判定为敏感内容。请调整 prompt 或参考图（常见触发：暴力、裸露、真人脸特征、特定角色等）后重试。'
  }
  if (status === 401 || status === 403) {
    return 'fal.ai API Key 无效或权限不足，请检查 Key 是否正确。'
  }
  if (status === 429) {
    return 'fal.ai 触发限流，请稍后重试。'
  }
  if (status === 404) {
    return 'fal.ai 找不到对应模型或任务。请检查模型 ID。'
  }
  if (msg) return `fal.ai 错误：${msg}`
  return `fal.ai 错误 (HTTP ${status})：${errorBody.slice(0, 200)}`
}

import {
  ProviderError,
  type HealthCheckInput,
  type ProviderAdapter,
  type ProviderGenerationInput,
  type ProviderVideoInput,
  type ProviderQueueSubmitInput,
  type ProviderQueueStatusInput,
  type ProviderExtendVideoInput,
} from '@/services/providers/types'
import { buildFalVideoQueueRequest } from '@/services/providers/fal/video-request-builders'

const FAL_RESPONSE_SCHEMA = z.object({
  images: z.array(
    z.object({
      url: z.string().url(),
      width: z.number().int().positive().nullable().optional(),
      height: z.number().int().positive().nullable().optional(),
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
  status_url: z.string().url(),
  response_url: z.string().url(),
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

function warnUnverifiedFalVideoBody(
  modelId: string,
  endpoint: string,
  body: Record<string, unknown>,
): void {
  // TODO(video-payload-audit): verify this endpoint against current fal.ai
  // schema once the provider documentation page is available again.
  logger.warn('fal.ai video request body uses unverified provider schema', {
    modelId,
    endpoint,
    body,
  })
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
    referenceImages,
    advancedParams,
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

    if (advancedParams?.negativePrompt) {
      body.negative_prompt = advancedParams.negativePrompt
    }
    if (advancedParams?.guidanceScale != null) {
      body.guidance_scale = advancedParams.guidanceScale
    }
    if (advancedParams?.steps != null) {
      body.num_inference_steps = advancedParams.steps
    }
    if (advancedParams?.seed != null && advancedParams.seed >= 0) {
      body.seed = advancedParams.seed
    }

    // LoRA models: pass loras array to fal.ai
    if (advancedParams?.loras?.length) {
      body.loras = advancedParams.loras.map((lora) => ({
        path: lora.url,
        scale: lora.scale ?? 1,
      }))
    }

    // Kontext models: native reference image handling (no strength/denoising)
    const KONTEXT_SINGLE_MODELS = new Set(['fal-ai/flux-pro/kontext'])
    const KONTEXT_MULTI_MODELS = new Set(['fal-ai/flux-pro/kontext/max/multi'])

    if (KONTEXT_MULTI_MODELS.has(externalModelId)) {
      // Kontext Max: multiple reference images
      if (referenceImages?.length) {
        body.image_urls = referenceImages
      }
    } else if (KONTEXT_SINGLE_MODELS.has(externalModelId)) {
      // Kontext Pro: single reference image
      const ref = referenceImages?.[0] ?? referenceImage
      if (ref) {
        body.image_url = ref
      }
    } else {
      // Standard FAL img2img: reference image with denoising strength
      const effectiveRefImage = referenceImages?.[0] ?? referenceImage
      if (effectiveRefImage) {
        body.image_url = effectiveRefImage
        // fal's `strength` = denoising strength (higher = more change, less similarity)
        // Our `referenceStrength` = how much to reference (higher = more similar)
        // Invert: denoising = 1 - referenceStrength
        if (advancedParams?.referenceStrength != null) {
          body.strength = invertReferenceStrength(
            advancedParams.referenceStrength,
          )
        }
      }
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error')
      logger.error('fal.ai generateImage failed', {
        status: response.status,
        modelId,
        endpoint,
        errorBody: errorBody.slice(0, 500),
      })
      throw new ProviderError(
        'fal.ai',
        response.status,
        formatFalError(response.status, errorBody),
      )
    }

    const data = FAL_RESPONSE_SCHEMA.parse(await response.json())
    const imageItem = data.images[0]

    if (!imageItem) {
      throw new ProviderError('fal.ai', 502, 'No image data returned')
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
    const modelConfig = getModelById(modelId)
    const request = buildFalVideoQueueRequest({
      prompt,
      modelId,
      externalModelId,
      aspectRatio,
      duration,
      referenceImage,
      i2vModelId: modelConfig?.i2vModelId,
      videoDefaults: modelConfig?.videoDefaults,
    })
    const endpoint = `${baseUrl}/${request.endpointModelId}`
    const body = request.input

    if (!request.isDocumentationVerified) {
      warnUnverifiedFalVideoBody(modelId, endpoint, body)
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
        throw new ProviderError(
          'fal.ai',
          response.status,
          formatFalError(response.status, errorBody),
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
    apiKey,
    duration,
    referenceImage,
    negativePrompt,
    resolution,
    i2vModelId,
    videoDefaults,
  }: ProviderQueueSubmitInput) {
    const externalModelId = getExecutionModelId(modelId)
    const request = buildFalVideoQueueRequest({
      prompt,
      modelId,
      externalModelId,
      aspectRatio,
      duration,
      referenceImage,
      negativePrompt,
      resolution,
      i2vModelId,
      videoDefaults,
    })
    const endpoint = `${AI_PROVIDER_ENDPOINTS.FAL_QUEUE}/${request.endpointModelId}`
    const body = request.input

    if (!request.isDocumentationVerified) {
      warnUnverifiedFalVideoBody(modelId, endpoint, body)
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error')
      throw new ProviderError(
        'fal.ai',
        response.status,
        formatFalError(response.status, errorBody),
      )
    }

    const data = FAL_QUEUE_SUBMIT_SCHEMA.parse(await response.json())
    return {
      requestId: data.request_id,
      statusUrl: data.status_url,
      responseUrl: data.response_url,
    }
  },

  async submitExtendVideoToQueue({
    videoUrl,
    prompt,
    aspectRatio,
    apiKey,
    extendEndpointId,
    duration,
  }: ProviderExtendVideoInput) {
    const endpoint = `${AI_PROVIDER_ENDPOINTS.FAL_QUEUE}/${extendEndpointId}`

    const body: Record<string, unknown> = {
      video_url: videoUrl,
      prompt,
      aspect_ratio: aspectRatio,
    }
    if (duration) {
      body.duration = String(duration)
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error')
      throw new ProviderError(
        'fal.ai',
        response.status,
        formatFalError(response.status, errorBody),
      )
    }

    const data = FAL_QUEUE_SUBMIT_SCHEMA.parse(await response.json())
    return {
      requestId: data.request_id,
      statusUrl: data.status_url,
      responseUrl: data.response_url,
    }
  },

  async checkVideoQueueStatus({
    statusUrl,
    responseUrl,
    apiKey,
  }: ProviderQueueStatusInput) {
    const statusResponse = await fetch(statusUrl, {
      method: 'GET',
      headers: { Authorization: `Key ${apiKey}` },
      signal: AbortSignal.timeout(30_000),
    })

    if (!statusResponse.ok) {
      const errorBody = await statusResponse.text().catch(() => 'Unknown error')
      logger.error('fal.ai checkVideoQueueStatus (status poll) failed', {
        status: statusResponse.status,
        statusUrl,
        errorBody: errorBody.slice(0, 1000),
      })
      throw new ProviderError(
        'fal.ai',
        statusResponse.status,
        formatFalError(statusResponse.status, errorBody),
      )
    }

    const statusData = FAL_QUEUE_STATUS_SCHEMA.parse(
      await statusResponse.json(),
    )

    if (statusData.status !== 'COMPLETED') {
      return { status: statusData.status as 'IN_QUEUE' | 'IN_PROGRESS' }
    }

    // Fetch the actual result using the response_url from submit
    const resultResponse = await fetch(responseUrl, {
      method: 'GET',
      headers: { Authorization: `Key ${apiKey}` },
      signal: AbortSignal.timeout(30_000),
    })

    if (!resultResponse.ok) {
      const errorBody = await resultResponse.text().catch(() => 'Unknown error')
      logger.error('fal.ai checkVideoQueueStatus (result fetch) failed', {
        status: resultResponse.status,
        responseUrl,
        errorBody: errorBody.slice(0, 1000),
      })
      throw new ProviderError(
        'fal.ai',
        resultResponse.status,
        formatFalError(resultResponse.status, errorBody),
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

  async healthCheck({ modelId, apiKey, baseUrl, timeoutMs }: HealthCheckInput) {
    const start = Date.now()
    try {
      const endpoint = `${baseUrl}/${modelId}`
      const response = await fetch(endpoint, {
        method: 'HEAD',
        headers: { Authorization: `Key ${apiKey}` },
        signal: AbortSignal.timeout(timeoutMs),
      })
      const latencyMs = Date.now() - start
      if (response.ok || response.status === 405 || response.status === 422) {
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

// ─── LoRA Training (standalone functions, not part of ProviderAdapter) ──

/**
 * Submit a LoRA training job to fal.ai's flux-lora-fast-training.
 * Returns the request_id for status polling.
 */
export async function submitFalLoraTraining(input: {
  apiKey: string
  inputImagesUrl: string
  triggerWord: string
  isStyle: boolean
}): Promise<{ requestId: string; statusUrl: string }> {
  const endpoint = `${AI_PROVIDER_ENDPOINTS.FAL_QUEUE}/fal-ai/flux-lora-fast-training`

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Key ${input.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: {
        images_data_url: input.inputImagesUrl,
        trigger_word: input.triggerWord,
        is_style: input.isStyle,
        create_masks: !input.isStyle,
      },
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error')
    throw new ProviderError(
      'fal.ai',
      response.status,
      formatFalError(response.status, errorBody),
    )
  }

  const data = FAL_QUEUE_SUBMIT_SCHEMA.parse(await response.json())
  return { requestId: data.request_id, statusUrl: data.status_url }
}

/**
 * Check status of a fal.ai LoRA training job.
 */
export async function checkFalLoraTrainingStatus(input: {
  apiKey: string
  statusUrl: string
  responseUrl: string
}): Promise<{
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'
  loraUrl: string | null
}> {
  const response = await fetch(input.statusUrl, {
    headers: { Authorization: `Key ${input.apiKey}` },
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error')
    throw new ProviderError(
      'fal.ai',
      response.status,
      formatFalError(response.status, errorBody),
    )
  }

  const data = FAL_QUEUE_STATUS_SCHEMA.parse(await response.json())

  if (data.status === 'COMPLETED') {
    // Fetch the result from response URL
    const resultResponse = await fetch(input.responseUrl, {
      headers: { Authorization: `Key ${input.apiKey}` },
    })
    if (resultResponse.ok) {
      const result = (await resultResponse.json()) as {
        diffusers_lora_file?: { url?: string }
      }
      return {
        status: 'COMPLETED',
        loraUrl: result.diffusers_lora_file?.url ?? null,
      }
    }
  }

  return {
    status: data.status === 'IN_QUEUE' ? 'IN_QUEUE' : 'IN_PROGRESS',
    loraUrl: null,
  }
}
