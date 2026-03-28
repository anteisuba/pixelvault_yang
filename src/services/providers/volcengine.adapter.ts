import 'server-only'

import { z } from 'zod'

import {
  API_USAGE,
  AI_PROVIDER_ENDPOINTS,
  VIDEO_GENERATION,
} from '@/constants/config'
import { getExecutionModelId, getModelById } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

import {
  ProviderError,
  type ProviderAdapter,
  type ProviderGenerationInput,
  type ProviderQueueSubmitInput,
  type ProviderQueueStatusInput,
  type HealthCheckInput,
} from '@/services/providers/types'

// ─── Image Generation Constants ─────────────────────────────────

/** VolcEngine Seedream 2K-tier resolution mapping */
const VOLCENGINE_IMAGE_SIZES: Record<
  string,
  { width: number; height: number; size: string }
> = {
  '1:1': { width: 2048, height: 2048, size: '2048x2048' },
  '16:9': { width: 2560, height: 1440, size: '2560x1440' },
  '9:16': { width: 1440, height: 2560, size: '1440x2560' },
  '4:3': { width: 2304, height: 1728, size: '2304x1728' },
  '3:4': { width: 1728, height: 2304, size: '1728x2304' },
}

const VOLCENGINE_MAX_SEED = 2_147_483_647

// ─── Response Schemas ────────────────────────────────────────────

const VOLCENGINE_IMAGE_RESPONSE_SCHEMA = z.object({
  data: z.array(
    z.object({
      url: z.string().url(),
      size: z.string().optional(),
    }),
  ),
})

const VOLCENGINE_TASK_SCHEMA = z.object({
  id: z.string(),
})

const VOLCENGINE_TASK_STATUS_SCHEMA = z.object({
  id: z.string(),
  model: z.string(),
  status: z.enum(['queued', 'running', 'succeeded', 'failed', 'expired']),
  // VolcEngine returns content as a flat object with direct URL strings
  content: z
    .object({
      video_url: z.string().optional(),
      last_frame_url: z.string().optional(),
    })
    .optional()
    .nullable(),
  error: z
    .object({
      code: z.string().optional(),
      message: z.string().optional(),
    })
    .optional()
    .nullable(),
  resolution: z.string().optional(),
  ratio: z.string().optional(),
  duration: z.number().optional(),
})

// ─── Helpers ─────────────────────────────────────────────────────

function buildBaseUrl(baseUrl?: string): string {
  return baseUrl || AI_PROVIDER_ENDPOINTS.VOLCENGINE
}

function buildHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }
}

// ─── Adapter ─────────────────────────────────────────────────────

/**
 * VolcEngine (火山方舟) adapter for Seedream image and Seedance video models.
 *
 * Image API (Seedream — synchronous):
 *   POST /images/generations → returns image URL directly
 *
 * Video API (Seedance — async queue):
 *   POST /contents/generations/tasks  → create async task → returns { id }
 *   GET  /contents/generations/tasks/{id} → poll status → returns video_url on success
 *
 * Auth: Bearer token (ARK_API_KEY), same pattern as OpenAI.
 */
export const volcengineAdapter: ProviderAdapter = {
  adapterType: AI_ADAPTER_TYPES.VOLCENGINE,

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
    const baseUrl = buildBaseUrl(providerConfig.baseUrl)
    const externalModelId = getExecutionModelId(modelId)
    const endpoint = `${baseUrl}/images/generations`

    const sizeEntry =
      VOLCENGINE_IMAGE_SIZES[aspectRatio ?? '1:1'] ??
      VOLCENGINE_IMAGE_SIZES['1:1']

    // VolcEngine uses content array format (same as video API)
    const content: Record<string, unknown>[] = [{ type: 'text', text: prompt }]

    // Reference images as image_url entries in the content array
    const allRefs: string[] = []
    if (referenceImages?.length) {
      allRefs.push(...referenceImages)
    } else if (referenceImage) {
      allRefs.push(referenceImage)
    }
    for (const ref of allRefs.slice(0, 10)) {
      content.push({ type: 'image_url', image_url: { url: ref } })
    }

    const body: Record<string, unknown> = {
      model: externalModelId,
      prompt,
      content,
      size: sizeEntry.size,
      response_format: 'url',
      watermark: false,
      n: 1,
    }

    // Seed
    if (advancedParams?.seed != null && advancedParams.seed >= 0) {
      body.seed = Math.min(advancedParams.seed, VOLCENGINE_MAX_SEED)
    }

    // Guidance scale
    if (advancedParams?.guidanceScale != null) {
      body.guidance_scale = advancedParams.guidanceScale
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: buildHeaders(apiKey),
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error')
      throw new ProviderError(
        'VolcEngine',
        response.status,
        response.status === 404
          ? `Model not found. VolcEngine requires an endpoint ID (ep-xxx), not a model name. Create an endpoint at console.volcengine.com, then add it as a custom model in your API key settings. Raw: ${errorBody}`
          : errorBody,
      )
    }

    const data = VOLCENGINE_IMAGE_RESPONSE_SCHEMA.parse(await response.json())
    const firstImage = data.data[0]
    if (!firstImage?.url) {
      throw new ProviderError(
        'VolcEngine',
        502,
        'Image generation succeeded but no image URL in response',
      )
    }

    return {
      imageUrl: firstImage.url,
      width: sizeEntry.width,
      height: sizeEntry.height,
      requestCount: API_USAGE.DEFAULT_REQUESTS_PER_GENERATION,
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
    negativePrompt,
    resolution,
    i2vModelId,
    videoDefaults,
  }: ProviderQueueSubmitInput) {
    const baseUrl = buildBaseUrl(providerConfig.baseUrl)
    const externalModelId = getExecutionModelId(modelId)
    const endpoint = `${baseUrl}/contents/generations/tasks`

    // Build content array
    const content: Record<string, unknown>[] = [{ type: 'text', text: prompt }]

    // First frame (image-to-video)
    if (referenceImage) {
      content.push({
        type: 'image_url',
        image_url: { url: referenceImage },
        role: 'first_frame',
      })
    }

    // Build request body
    const body: Record<string, unknown> = {
      model: externalModelId,
      content,
    }

    // Aspect ratio
    if (aspectRatio) {
      body.ratio = aspectRatio
    }

    // Duration (2-12 seconds)
    if (duration != null) {
      body.duration = Math.min(12, Math.max(2, duration))
    } else {
      body.duration = VIDEO_GENERATION.DEFAULT_DURATION
    }

    // Resolution
    const effectiveResolution =
      resolution ??
      (videoDefaults as Record<string, unknown> | undefined)?.resolution
    if (effectiveResolution) {
      body.resolution = effectiveResolution
    }

    // Generate audio (Seedance 1.5 Pro only)
    const generateAudio = (videoDefaults as Record<string, unknown> | undefined)
      ?.generateAudio
    if (generateAudio != null) {
      body.generate_audio = generateAudio
    }

    // Seed for reproducibility
    const modelConfig = getModelById(modelId)
    if (
      negativePrompt === undefined &&
      modelConfig?.videoDefaults?.negativePrompt
    ) {
      // Use model default negative prompt if user didn't specify
    }

    // Return last frame for video continuation workflows
    body.return_last_frame = true

    // No watermark
    body.watermark = false

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: buildHeaders(apiKey),
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error')
      throw new ProviderError(
        'VolcEngine',
        response.status,
        response.status === 404
          ? `Model not found. VolcEngine requires an endpoint ID (ep-xxx), not a model name. Create an endpoint at console.volcengine.com, then add it as a custom model in your API key settings. Raw: ${errorBody}`
          : errorBody,
      )
    }

    const data = VOLCENGINE_TASK_SCHEMA.parse(await response.json())
    const taskId = data.id

    // VolcEngine uses the same base URL for status polling
    const statusUrl = `${baseUrl}/contents/generations/tasks/${taskId}`
    const responseUrl = statusUrl

    return {
      requestId: taskId,
      statusUrl,
      responseUrl,
    }
  },

  async checkVideoQueueStatus({ statusUrl, apiKey }: ProviderQueueStatusInput) {
    const response = await fetch(statusUrl, {
      method: 'GET',
      headers: buildHeaders(apiKey),
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error')
      throw new ProviderError('VolcEngine', response.status, errorBody)
    }

    const data = VOLCENGINE_TASK_STATUS_SCHEMA.parse(await response.json())

    // Map VolcEngine status to our unified status
    const statusMap: Record<
      string,
      'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'
    > = {
      queued: 'IN_QUEUE',
      running: 'IN_PROGRESS',
      succeeded: 'COMPLETED',
      failed: 'FAILED',
      expired: 'FAILED',
    }

    const status = statusMap[data.status] ?? 'IN_QUEUE'

    if (status === 'COMPLETED' && data.content) {
      const videoUrl = data.content.video_url
      if (!videoUrl) {
        throw new ProviderError(
          'VolcEngine',
          502,
          'Task succeeded but no video URL in response',
        )
      }

      // Derive dimensions from resolution (e.g. "1080p" → 1920x1080)
      const is1080p = data.resolution === '1080p'
      const width = is1080p ? 1920 : 1280
      const height = is1080p ? 1080 : 720

      return {
        status: 'COMPLETED' as const,
        result: {
          videoUrl,
          thumbnailUrl: data.content.last_frame_url ?? undefined,
          width,
          height,
          duration: data.duration ?? 5,
          requestCount: API_USAGE.DEFAULT_REQUESTS_PER_GENERATION,
        },
      }
    }

    if (status === 'FAILED') {
      const errorMsg = data.error?.message ?? 'Video generation failed'
      throw new ProviderError('VolcEngine', 502, errorMsg)
    }

    return { status }
  },

  async healthCheck({ apiKey, baseUrl, timeoutMs }: HealthCheckInput) {
    const start = Date.now()
    const url = `${(baseUrl || AI_PROVIDER_ENDPOINTS.VOLCENGINE).replace(/\/$/, '')}/models`

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(timeoutMs),
      })

      const latencyMs = Date.now() - start
      if (response.ok) {
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
