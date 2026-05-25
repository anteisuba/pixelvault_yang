import 'server-only'

import { z } from 'zod'

import {
  API_USAGE,
  AI_PROVIDER_ENDPOINTS,
  IMAGE_SIZES,
  MAX_DURATION_CONFIGS,
  VIDEO_GENERATION,
} from '@/constants/config'
import { getExecutionModelId, getModelById } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { HUNYUAN3D_FACE_COUNT } from '@/constants/model-3d-generation'

import { invertReferenceStrength } from '@/lib/utils'
import { logger } from '@/lib/logger'
import { injectCivitaiToken } from '@/services/civitai-token.service'

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
  const detailText = typeof detail === 'string' ? detail : undefined
  const normalizedMessage = [type, msg, detailText, errorBody]
    .filter((part): part is string => typeof part === 'string')
    .join(' ')

  if (type === 'content_policy_violation') {
    return 'fal.ai 内容审核拒绝：生成结果被判定为敏感内容。请调整 prompt 或参考图（常见触发：暴力、裸露、真人脸特征、特定角色等）后重试。'
  }
  if (
    /exhausted\s+balance|top\s+up.*balance|billing|payment|insufficient.*(?:balance|credits?)|余额不足|余额已耗尽|充值/i.test(
      normalizedMessage,
    )
  ) {
    return 'fal.ai 账户余额不足，请前往 fal.ai 控制台充值，或切换到有余额的 API Key 后重试。'
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
  type ProviderModel3DInput,
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
  has_nsfw_concepts: z.array(z.boolean()).optional(),
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

const FAL_AUDIO_FILE_SCHEMA = z
  .object({
    url: z.string().url(),
    content_type: z.string().optional().nullable(),
    file_name: z.string().optional().nullable(),
    file_size: z.number().optional().nullable(),
  })
  .passthrough()

const FAL_AUDIO_RESPONSE_SCHEMA = z.object({
  audio_url: FAL_AUDIO_FILE_SCHEMA,
})

const FAL_QUEUE_SUBMIT_SCHEMA = z.object({
  request_id: z.string(),
  status_url: z.string().url(),
  response_url: z.string().url(),
})

// fal occasionally returns status values outside the documented set
// (e.g. ERROR, CANCELED, or future additions). Keep the schema permissive
// so an unknown status surfaces as a clean "failed" rather than a zod
// parse error → 502. fal also routinely sends `null` for optional fields
// (e.g. `logs: null` in IN_QUEUE state), so every field is `nullable()`
// in addition to `optional()` to avoid spurious schema rejections.
const FAL_QUEUE_STATUS_SCHEMA = z
  .object({
    status: z.string(),
    response_url: z.string().url().nullable().optional(),
    logs: z
      .array(
        z
          .object({
            message: z.string().nullable().optional(),
            level: z.string().nullable().optional(),
          })
          .passthrough(),
      )
      .nullable()
      .optional(),
    error: z.unknown().nullable().optional(),
    detail: z.unknown().nullable().optional(),
  })
  .passthrough()

const FAL_MODEL_3D_FILE_SCHEMA = z
  .object({
    url: z.string().url(),
    content_type: z.string().nullable().optional(),
    file_name: z.string().nullable().optional(),
    file_size: z.number().nullable().optional(),
  })
  .passthrough()

const FAL_MODEL_3D_RESPONSE_SCHEMA = z
  .object({
    model_mesh: FAL_MODEL_3D_FILE_SCHEMA.optional(),
    model_glb: FAL_MODEL_3D_FILE_SCHEMA.optional(),
    model_urls: z
      .object({
        glb: FAL_MODEL_3D_FILE_SCHEMA.optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()

// fal.ai exposes Hunyuan3D under both `input_image_url` and `image_url`
// depending on entry point. TripoSR uses `image_url`. The map keeps the
// per-model field name explicit so we don't over-broadcast.
const FAL_MODEL_3D_IMAGE_FIELD: Record<
  string,
  'input_image_url' | 'image_url'
> = {
  'fal-ai/hunyuan3d/v2': 'input_image_url',
  'fal-ai/hunyuan3d-v3/image-to-3d': 'input_image_url',
  'fal-ai/hunyuan-3d/v3.1/pro/image-to-3d': 'input_image_url',
  'fal-ai/trellis-2': 'image_url',
  'fal-ai/triposr': 'image_url',
}

const FAL_HUNYUAN3D_V3_MODEL_IDS = new Set([
  'fal-ai/hunyuan3d-v3/image-to-3d',
  'fal-ai/hunyuan-3d/v3.1/pro/image-to-3d',
])

const FAL_TRELLIS_2_MODEL_ID = 'fal-ai/trellis-2'

function isFalHunyuan3DV3Model(externalModelId: string): boolean {
  return FAL_HUNYUAN3D_V3_MODEL_IDS.has(externalModelId)
}

function isFalTrellis2Model(externalModelId: string): boolean {
  return externalModelId === FAL_TRELLIS_2_MODEL_ID
}

function pickFalModel3DFile(
  data: z.infer<typeof FAL_MODEL_3D_RESPONSE_SCHEMA>,
): z.infer<typeof FAL_MODEL_3D_FILE_SCHEMA> | null {
  return data.model_glb ?? data.model_urls?.glb ?? data.model_mesh ?? null
}

const FAL_IMAGE_SIZES: Record<string, string> = {
  '1:1': 'square_hd',
  '16:9': 'landscape_16_9',
  '9:16': 'portrait_16_9',
  '4:3': 'landscape_4_3',
  '3:4': 'portrait_4_3',
}

const FAL_IMAGE_QUEUE_POLL_INTERVAL_MS = 2_000
const FAL_IMAGE_QUEUE_SUBMIT_TIMEOUT_MS = 20_000
const FAL_IMAGE_QUEUE_REQUEST_TIMEOUT_MS = 120_000
const FAL_IMAGE_QUEUE_ROUTE_MARGIN_MS = 20_000
const FAL_IMAGE_QUEUE_DEFAULT_TIMEOUT_MS = 210_000
const FAL_IMAGE_QUEUE_MAX_TIMEOUT_MS =
  MAX_DURATION_CONFIGS.generate * 1000 - FAL_IMAGE_QUEUE_ROUTE_MARGIN_MS

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

function stringifyFalQueueError(value: unknown): string | undefined {
  if (!value) return undefined
  if (typeof value === 'string') return value
  if (typeof value === 'object' && value !== null) {
    if ('message' in value && typeof value.message === 'string') {
      return value.message
    }
    if ('msg' in value && typeof value.msg === 'string') {
      return value.msg
    }
  }
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function isFalQueueFailureStatus(status: string): boolean {
  const normalized = status.toUpperCase()
  return (
    normalized === 'FAILED' ||
    normalized === 'ERROR' ||
    normalized === 'CANCELED' ||
    normalized === 'CANCELLED'
  )
}

function inferAudioFormatFromFalFile(file: {
  content_type?: string | null
  file_name?: string | null
}): 'mp3' | 'wav' | 'opus' {
  const contentType = file.content_type?.toLowerCase() ?? ''
  const fileName = file.file_name?.toLowerCase() ?? ''

  if (contentType.includes('wav') || fileName.endsWith('.wav')) return 'wav'
  if (contentType.includes('opus') || fileName.endsWith('.opus')) return 'opus'
  return 'mp3'
}

function getFalImageQueueTimeoutMs(modelId: string): number {
  const modelTimeoutMs = getModelById(modelId)?.timeoutMs
  const requestedTimeoutMs =
    modelTimeoutMs && modelTimeoutMs > 0
      ? modelTimeoutMs
      : FAL_IMAGE_QUEUE_DEFAULT_TIMEOUT_MS

  return Math.min(requestedTimeoutMs, FAL_IMAGE_QUEUE_MAX_TIMEOUT_MS)
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

function isAbortLikeError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const name =
    'name' in error && typeof error.name === 'string' ? error.name : undefined
  const message =
    'message' in error && typeof error.message === 'string'
      ? error.message.toLowerCase()
      : undefined

  return (
    name === 'AbortError' ||
    name === 'TimeoutError' ||
    message?.includes('aborted due to timeout') === true
  )
}

async function fetchFalQueue(
  phase: 'submit' | 'status' | 'result',
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  try {
    return await fetch(input, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    if (isAbortLikeError(error)) {
      logger.warn('fal.ai queue request timed out', {
        phase,
        endpoint: String(input).split('?')[0],
        timeoutMs,
      })
      throw new ProviderError(
        'fal.ai',
        504,
        `fal.ai queue ${phase} request timed out after ${Math.round(timeoutMs / 1000)}s`,
      )
    }
    throw error
  }
}

async function submitFalImageQueue(params: {
  endpoint: string
  apiKey: string
  body: Record<string, unknown>
}): Promise<z.infer<typeof FAL_QUEUE_SUBMIT_SCHEMA>> {
  logger.info('fal.ai image queue submit started', {
    endpoint: params.endpoint,
    timeoutMs: FAL_IMAGE_QUEUE_SUBMIT_TIMEOUT_MS,
  })

  const response = await fetchFalQueue(
    'submit',
    params.endpoint,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Key ${params.apiKey}`,
        'Content-Type': 'application/json',
        'x-fal-queue-priority': 'normal',
      },
      body: JSON.stringify(params.body),
    },
    FAL_IMAGE_QUEUE_SUBMIT_TIMEOUT_MS,
  )

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error')
    throw new ProviderError(
      'fal.ai',
      response.status,
      formatFalError(response.status, errorBody),
    )
  }

  const queue = FAL_QUEUE_SUBMIT_SCHEMA.parse(await response.json())
  logger.info('fal.ai image queue submitted', {
    requestId: queue.request_id,
    statusUrl: queue.status_url,
  })
  return queue
}

async function pollFalImageQueue(params: {
  statusUrl: string
  responseUrl: string
  apiKey: string
  timeoutMs: number
}): Promise<z.infer<typeof FAL_RESPONSE_SCHEMA>> {
  const startedAt = Date.now()

  while (Date.now() - startedAt < params.timeoutMs) {
    const statusResponse = await fetchFalQueue(
      'status',
      `${params.statusUrl}?logs=1`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Key ${params.apiKey}`,
        },
      },
      FAL_IMAGE_QUEUE_REQUEST_TIMEOUT_MS,
    )

    if (!statusResponse.ok) {
      const errorBody = await statusResponse.text().catch(() => 'Unknown error')
      throw new ProviderError(
        'fal.ai',
        statusResponse.status,
        formatFalError(statusResponse.status, errorBody),
      )
    }

    const statusData = FAL_QUEUE_STATUS_SCHEMA.parse(
      await statusResponse.json(),
    )

    if (isFalQueueFailureStatus(statusData.status)) {
      const errorMessage =
        stringifyFalQueueError(statusData.error) ??
        stringifyFalQueueError(statusData.detail) ??
        `Queue request failed with status ${statusData.status}`
      throw new ProviderError('fal.ai', 502, errorMessage)
    }

    if (statusData.status === 'COMPLETED') {
      const resultResponse = await fetchFalQueue(
        'result',
        statusData.response_url ?? params.responseUrl,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            Authorization: `Key ${params.apiKey}`,
          },
        },
        FAL_IMAGE_QUEUE_REQUEST_TIMEOUT_MS,
      )

      if (!resultResponse.ok) {
        const errorBody = await resultResponse
          .text()
          .catch(() => 'Unknown error')
        throw new ProviderError(
          'fal.ai',
          resultResponse.status,
          formatFalError(resultResponse.status, errorBody),
        )
      }

      return FAL_RESPONSE_SCHEMA.parse(await resultResponse.json())
    }

    await wait(FAL_IMAGE_QUEUE_POLL_INTERVAL_MS)
  }

  throw new ProviderError(
    'fal.ai',
    504,
    `Image generation timed out after ${Math.round(params.timeoutMs / 1000)}s`,
  )
}

export const falAdapter: ProviderAdapter = {
  adapterType: AI_ADAPTER_TYPES.FAL,
  async generateImage({
    prompt,
    modelId,
    aspectRatio,
    apiKey,
    referenceImage,
    referenceImages,
    advancedParams,
    civitaiToken,
  }: ProviderGenerationInput) {
    const { width, height } = IMAGE_SIZES[aspectRatio] ?? IMAGE_SIZES['1:1']
    const externalModelId = getExecutionModelId(modelId)
    const endpoint = `${AI_PROVIDER_ENDPOINTS.FAL_QUEUE}/${externalModelId}`

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
        path: civitaiToken
          ? injectCivitaiToken(lora.url, civitaiToken)
          : lora.url,
        scale: lora.scale ?? 1,
      }))
    }

    // Kontext models: native reference image handling (no strength/denoising)
    const KONTEXT_SINGLE_MODELS = new Set(['fal-ai/flux-pro/kontext'])
    const KONTEXT_MULTI_MODELS = new Set(['fal-ai/flux-pro/kontext/max/multi'])
    const TEXT_TO_IMAGE_ONLY_MODELS = new Set(['fal-ai/flux-lora'])

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
    } else if (!TEXT_TO_IMAGE_ONLY_MODELS.has(externalModelId)) {
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

    const queue = await submitFalImageQueue({ endpoint, apiKey, body })
    const data = await pollFalImageQueue({
      statusUrl: queue.status_url,
      responseUrl: queue.response_url,
      apiKey,
      timeoutMs: getFalImageQueueTimeoutMs(modelId),
    })

    if (data.has_nsfw_concepts?.some(Boolean)) {
      throw new ProviderError(
        'fal.ai',
        422,
        'fal.ai 内容审核拒绝：生成结果被判定为敏感内容。请调整 prompt 或参考图（常见触发：暴力、裸露、真人脸特征、特定角色等）后重试。',
      )
    }

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
    referenceImages,
    audioUrls,
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
      referenceImages,
      audioUrls,
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

  async submitAudioToQueue({
    prompt,
    modelId,
    apiKey,
    referenceAudioUrl,
    referenceText,
  }) {
    if (!referenceAudioUrl) {
      throw new ProviderError(
        'fal.ai',
        400,
        'fal.ai F5-TTS requires a reference audio URL.',
      )
    }

    const externalModelId = getExecutionModelId(modelId)
    const endpoint = `${AI_PROVIDER_ENDPOINTS.FAL_QUEUE}/${externalModelId}`
    const body: Record<string, unknown> = {
      gen_text: prompt,
      ref_audio_url: referenceAudioUrl,
      model_type: 'F5-TTS',
      remove_silence: true,
    }

    if (referenceText?.trim()) {
      body.ref_text = referenceText.trim()
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

  async checkAudioQueueStatus({
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
      throw new ProviderError(
        'fal.ai',
        statusResponse.status,
        formatFalError(statusResponse.status, errorBody),
      )
    }

    const statusData = FAL_QUEUE_STATUS_SCHEMA.parse(
      await statusResponse.json(),
    )

    if (isFalQueueFailureStatus(statusData.status)) {
      return { status: 'FAILED' as const }
    }

    if (statusData.status !== 'COMPLETED') {
      return {
        status:
          statusData.status === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'IN_QUEUE',
      }
    }

    const resultResponse = await fetch(responseUrl, {
      method: 'GET',
      headers: { Authorization: `Key ${apiKey}` },
      signal: AbortSignal.timeout(30_000),
    })

    if (!resultResponse.ok) {
      const errorBody = await resultResponse.text().catch(() => 'Unknown error')
      throw new ProviderError(
        'fal.ai',
        resultResponse.status,
        formatFalError(resultResponse.status, errorBody),
      )
    }

    const resultData = FAL_AUDIO_RESPONSE_SCHEMA.parse(
      await resultResponse.json(),
    )

    return {
      status: 'COMPLETED' as const,
      result: {
        audioUrl: resultData.audio_url.url,
        duration: 0,
        format: inferAudioFormatFromFalFile(resultData.audio_url),
        sampleRate: 44100,
        requestCount: API_USAGE.DEFAULT_REQUESTS_PER_GENERATION,
      },
    }
  },

  async submitModel3DToQueue({
    imageUrl,
    modelId,
    apiKey,
    texturedMesh,
    octreeResolution,
    multiViewImages,
    enablePbr,
    faceCount,
    generateType,
    polygonType,
    trellisResolution,
    trellisTextureSize,
    trellisDecimationTarget,
    trellisRemesh,
    trellisRemeshProject,
    trellisStructureSamplingSteps,
    trellisShapeSamplingSteps,
    trellisTextureSamplingSteps,
    removeBackground,
    seed,
  }: ProviderModel3DInput) {
    const externalModelId = getExecutionModelId(modelId)
    const endpoint = `${AI_PROVIDER_ENDPOINTS.FAL_QUEUE}/${externalModelId}`
    const imageField = FAL_MODEL_3D_IMAGE_FIELD[externalModelId] ?? 'image_url'

    const body: Record<string, unknown> = {
      [imageField]: imageUrl,
    }
    if (texturedMesh != null) body.textured_mesh = texturedMesh
    if (octreeResolution != null) body.octree_resolution = octreeResolution
    if (isFalHunyuan3DV3Model(externalModelId)) {
      if (multiViewImages?.backImageUrl) {
        body.back_image_url = multiViewImages.backImageUrl
      }
      if (multiViewImages?.leftImageUrl) {
        body.left_image_url = multiViewImages.leftImageUrl
      }
      if (multiViewImages?.rightImageUrl) {
        body.right_image_url = multiViewImages.rightImageUrl
      }
      if (multiViewImages?.topImageUrl) {
        body.top_image_url = multiViewImages.topImageUrl
      }
      if (multiViewImages?.bottomImageUrl) {
        body.bottom_image_url = multiViewImages.bottomImageUrl
      }
      if (multiViewImages?.leftFrontImageUrl) {
        body.left_front_image_url = multiViewImages.leftFrontImageUrl
      }
      if (multiViewImages?.rightFrontImageUrl) {
        body.right_front_image_url = multiViewImages.rightFrontImageUrl
      }
      if (enablePbr != null) body.enable_pbr = enablePbr
      body.face_count = faceCount ?? HUNYUAN3D_FACE_COUNT.DEFAULT
      if (generateType) body.generate_type = generateType
      if (polygonType) body.polygon_type = polygonType
    }
    if (isFalTrellis2Model(externalModelId)) {
      if (trellisResolution != null) body.resolution = trellisResolution
      if (trellisTextureSize != null) body.texture_size = trellisTextureSize
      if (trellisDecimationTarget != null) {
        body.decimation_target = trellisDecimationTarget
      }
      if (trellisRemesh != null) body.remesh = trellisRemesh
      if (trellisRemeshProject != null) {
        body.remesh_project = trellisRemeshProject
      }
      if (trellisStructureSamplingSteps != null) {
        body.ss_sampling_steps = trellisStructureSamplingSteps
      }
      if (trellisShapeSamplingSteps != null) {
        body.shape_slat_sampling_steps = trellisShapeSamplingSteps
      }
      if (trellisTextureSamplingSteps != null) {
        body.tex_slat_sampling_steps = trellisTextureSamplingSteps
      }
    }
    if (removeBackground != null) body.do_remove_background = removeBackground
    if (seed != null && seed >= 0) body.seed = seed

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
      logger.error('fal.ai submitModel3DToQueue failed', {
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

    const data = FAL_QUEUE_SUBMIT_SCHEMA.parse(await response.json())
    return {
      requestId: data.request_id,
      statusUrl: data.status_url,
      responseUrl: data.response_url,
    }
  },

  async checkModel3DQueueStatus({
    statusUrl,
    responseUrl,
    apiKey,
  }: ProviderQueueStatusInput) {
    let statusResponse: Response
    try {
      statusResponse = await fetch(statusUrl, {
        method: 'GET',
        headers: { Authorization: `Key ${apiKey}` },
        signal: AbortSignal.timeout(30_000),
      })
    } catch (fetchErr) {
      const msg =
        fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
      logger.warn('fal.ai 3D status fetch failed', { statusUrl, msg })
      throw new ProviderError('fal.ai', 502, `[3D-status-fetch-error] ${msg}`)
    }

    if (!statusResponse.ok) {
      const errorBody = await statusResponse.text().catch(() => 'Unknown error')
      logger.error('fal.ai 3D status request failed', {
        status: statusResponse.status,
        statusUrl,
        errorBody: errorBody.slice(0, 2000),
      })
      throw new ProviderError(
        'fal.ai',
        statusResponse.status,
        `[3D-status-http-${statusResponse.status}] ${errorBody.slice(0, 500)}`,
      )
    }

    const statusJson = await statusResponse.json()
    logger.debug('fal.ai 3D status response', {
      statusUrl,
      body: JSON.stringify(statusJson).slice(0, 1500),
    })
    const statusParse = FAL_QUEUE_STATUS_SCHEMA.safeParse(statusJson)
    if (!statusParse.success) {
      throw new ProviderError(
        'fal.ai',
        502,
        `[3D-status-schema-mismatch] body=${JSON.stringify(statusJson).slice(0, 500)} zod=${statusParse.error.message.slice(0, 200)}`,
      )
    }
    const statusData = statusParse.data

    if (
      statusData.status === 'IN_QUEUE' ||
      statusData.status === 'IN_PROGRESS'
    ) {
      return { status: statusData.status }
    }

    if (statusData.status === 'FAILED') {
      logger.warn('fal.ai 3D queue failed', {
        statusUrl,
        error: JSON.stringify(
          statusData.error ?? statusData.detail ?? null,
        ).slice(0, 1000),
      })
      return { status: 'FAILED' as const }
    }

    if (statusData.status !== 'COMPLETED') {
      logger.warn('fal.ai 3D queue returned terminal unknown status', {
        status: statusData.status,
        statusUrl,
        body: JSON.stringify(statusJson).slice(0, 1000),
      })
      return { status: 'FAILED' as const }
    }

    logger.debug('fal.ai 3D result fetch starting', { responseUrl })

    let resultResponse: Response
    try {
      resultResponse = await fetch(responseUrl, {
        method: 'GET',
        headers: { Authorization: `Key ${apiKey}` },
        signal: AbortSignal.timeout(30_000),
      })
    } catch (fetchErr) {
      const msg =
        fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
      logger.error('fal.ai 3D result fetch failed', { responseUrl, msg })
      throw new ProviderError('fal.ai', 502, `[3D-result-fetch-error] ${msg}`)
    }

    let resultRawText = ''
    try {
      resultRawText = await resultResponse.text()
    } catch (readErr) {
      const msg = readErr instanceof Error ? readErr.message : String(readErr)
      logger.error('fal.ai 3D result body read failed', { responseUrl, msg })
      throw new ProviderError('fal.ai', 502, `[3D-result-read-error] ${msg}`)
    }

    logger.debug('fal.ai 3D result response', {
      httpStatus: resultResponse.status,
      responseUrl,
      bodyLength: resultRawText.length,
      bodyExcerpt: resultRawText.slice(0, 2000),
    })

    if (!resultResponse.ok) {
      throw new ProviderError(
        'fal.ai',
        resultResponse.status,
        `[3D-result-http-${resultResponse.status}] ${resultRawText.slice(0, 500)}`,
      )
    }

    let resultJson: unknown
    try {
      resultJson = JSON.parse(resultRawText)
    } catch {
      throw new ProviderError(
        'fal.ai',
        502,
        `[3D-result-not-json] ${resultRawText.slice(0, 500)}`,
      )
    }

    const resultParse = FAL_MODEL_3D_RESPONSE_SCHEMA.safeParse(resultJson)
    if (!resultParse.success) {
      throw new ProviderError(
        'fal.ai',
        502,
        `[3D-result-schema-mismatch] body=${JSON.stringify(resultJson).slice(0, 500)} zod=${resultParse.error.message.slice(0, 200)}`,
      )
    }

    const modelFile = pickFalModel3DFile(resultParse.data)
    if (!modelFile) {
      throw new ProviderError(
        'fal.ai',
        502,
        `[3D-result-missing-model-file] body=${JSON.stringify(resultJson).slice(0, 500)}`,
      )
    }

    return {
      status: 'COMPLETED' as const,
      result: {
        modelUrl: modelFile.url,
        contentType: modelFile.content_type ?? undefined,
        fileSize: modelFile.file_size ?? undefined,
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
