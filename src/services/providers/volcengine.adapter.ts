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
} from '@/services/providers/types'

// ─── Response Schemas ────────────────────────────────────────────

const VOLCENGINE_TASK_SCHEMA = z.object({
  id: z.string(),
})

const VOLCENGINE_TASK_STATUS_SCHEMA = z.object({
  id: z.string(),
  model: z.string(),
  status: z.enum(['queued', 'running', 'succeeded', 'failed', 'expired']),
  content: z
    .array(
      z.object({
        type: z.enum(['video_url', 'image_url']).optional(),
        video_url: z.object({ url: z.string().url() }).optional().nullable(),
        image_url: z.object({ url: z.string() }).optional().nullable(),
      }),
    )
    .optional()
    .nullable(),
  error: z
    .object({
      code: z.string().optional(),
      message: z.string().optional(),
    })
    .optional()
    .nullable(),
  usage: z
    .object({
      // VolcEngine uses token-based billing
      prompt_tokens: z.number().optional(),
      completion_tokens: z.number().optional(),
    })
    .optional()
    .nullable(),
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
 * VolcEngine (火山方舟) adapter for Seedance video models.
 *
 * API flow:
 *   POST /contents/generations/tasks  → create async task → returns { id }
 *   GET  /contents/generations/tasks/{id} → poll status → returns video_url on success
 *
 * Auth: Bearer token (ARK_API_KEY), same pattern as OpenAI.
 * Models: doubao-seedance-1-5-pro (audio + first/last frame), doubao-seedance-1-0-pro-250528
 */
export const volcengineAdapter: ProviderAdapter = {
  adapterType: AI_ADAPTER_TYPES.VOLCENGINE,

  async generateImage(_input: ProviderGenerationInput) {
    // VolcEngine Seedance models are video-only; image generation not supported
    throw new ProviderError(
      'VolcEngine',
      400,
      'VolcEngine Seedance models only support video generation',
    )
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
      throw new ProviderError('VolcEngine', response.status, errorBody)
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
      // Find the video URL from the content array
      const videoContent = data.content.find(
        (c) => c.type === 'video_url' || c.video_url,
      )
      // Find last frame image if returned
      const lastFrameContent = data.content.find(
        (c) => c.type === 'image_url' || c.image_url,
      )

      const videoUrl = videoContent?.video_url?.url
      if (!videoUrl) {
        throw new ProviderError(
          'VolcEngine',
          502,
          'Task succeeded but no video URL in response',
        )
      }

      return {
        status: 'COMPLETED' as const,
        result: {
          videoUrl,
          thumbnailUrl: lastFrameContent?.image_url?.url ?? undefined,
          width: 1920,
          height: 1080,
          duration: 5,
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
}
