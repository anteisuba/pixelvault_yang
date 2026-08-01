import 'server-only'

import { z } from 'zod'

import { API_USAGE, AI_PROVIDER_ENDPOINTS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

import {
  ProviderError,
  type ProviderAdapter,
  type ProviderQueueSubmitInput,
  type ProviderQueueStatusInput,
  type ProviderGenerationResult,
  type HealthCheckInput,
} from '@/services/providers/types'

import { logger } from '@/lib/logger'

/**
 * MiniMax (Hailuo) video adapter — MiniMax-H3.
 *
 *   POST {base}/video_generation                → { task_id }
 *   GET  {base}/query/video_generation/{taskId} → { task: { status, content:{ url } } }
 *
 * Auth: `Authorization: Bearer <key>` (same shape as VolcEngine/OpenAI).
 *
 * One adapter object serves **both stations** — global (api.minimax.io) and CN
 * (api.minimaxi.com) — because the wire format is identical; only the base URL
 * and the key differ, and both arrive via `providerConfig` / `apiKey`. The two
 * stations still need two adapter *types* so their keys stay in separate slots
 * (keys are not interchangeable); `minimaxAdapter` and `minimaxCnAdapter` below
 * are the same implementation wearing two `adapterType` labels.
 */

const MINIMAX_MIN_DURATION = 4
const MINIMAX_MAX_DURATION = 15
const MINIMAX_DEFAULT_DURATION = 5

/** Wire value for the only resolution H3 emits. Our enum stores it as '2k'. */
const MINIMAX_RESOLUTION = '2K'

/** Execution id shared by every H3 catalog entry on both stations. */
const MINIMAX_EXECUTION_MODEL_ID = 'MiniMax-H3'

/**
 * Per-modality reference caps, and a hard total across all three. The provider
 * enforces both — exceeding either is a 400, so we clamp before sending.
 * (Same 9/3/3-capped-at-12 shape Seedance 2.0 uses.)
 */
const MINIMAX_MAX_REFERENCE_IMAGES = 9
const MINIMAX_MAX_REFERENCE_VIDEOS = 3
const MINIMAX_MAX_REFERENCE_AUDIO = 3
const MINIMAX_MAX_REFERENCE_FILES = 12

/**
 * 2K output dimensions per aspect ratio. Deliberately the same numbers as
 * `VOLCENGINE_IMAGE_SIZES` — both are "2K tier" and keeping them identical
 * means downstream thumbnail/layout math doesn't need a second special case.
 */
const MINIMAX_2K_DIMENSIONS: Record<string, { width: number; height: number }> =
  {
    '1:1': { width: 2048, height: 2048 },
    '16:9': { width: 2560, height: 1440 },
    '9:16': { width: 1440, height: 2560 },
    '4:3': { width: 2304, height: 1728 },
    '3:4': { width: 1728, height: 2304 },
  }

// ─── Response Schemas ────────────────────────────────────────────

const MINIMAX_SUBMIT_SCHEMA = z.object({
  task_id: z.string(),
})

/**
 * `status` is intentionally a plain string, not a `z.enum`. MiniMax documents
 * succeeded/failed/cancelled/expired plus unnamed intermediate states, and an
 * undocumented value must not blow up an in-flight poll — `mapStatus` treats
 * anything it doesn't recognise as "still queued" so the poller keeps going.
 */
const MINIMAX_STATUS_SCHEMA = z.object({
  task: z.object({
    status: z.string(),
    content: z
      .object({
        url: z.string().optional(),
      })
      .optional()
      .nullable(),
    error: z.string().optional().nullable(),
  }),
})

// ─── Helpers ─────────────────────────────────────────────────────

const buildBaseUrl = (baseUrl: string): string => baseUrl.replace(/\/$/, '')

const buildHeaders = (apiKey: string): Record<string, string> => ({
  Authorization: `Bearer ${apiKey}`,
  'Content-Type': 'application/json',
})

function formatMiniMaxError(status: number, errorBody: string): string {
  let message: string | undefined
  try {
    const parsed: unknown = JSON.parse(errorBody)
    if (parsed && typeof parsed === 'object') {
      const base = (parsed as { base_resp?: { status_msg?: unknown } })
        .base_resp
      if (typeof base?.status_msg === 'string') message = base.status_msg
      const flat = parsed as { error?: unknown; message?: unknown }
      if (!message && typeof flat.message === 'string') message = flat.message
      if (!message && typeof flat.error === 'string') message = flat.error
    }
  } catch {
    // not JSON — fall through to the raw body
  }

  if (status === 401 || status === 403) {
    return 'MiniMax API Key 无效或权限不足。⚠ 国内站（minimaxi.com）与国际站（minimax.io）的密钥不通用，请确认密钥来自与所选线路相同的站点。'
  }
  if (status === 429) {
    return 'MiniMax 请求过于频繁或额度不足，请稍后重试。'
  }
  if (message) return `MiniMax 错误：${message}`
  return `MiniMax 错误 (HTTP ${status})：${errorBody.slice(0, 200)}`
}

/**
 * Unknown → IN_QUEUE on purpose: a status string we don't recognise means the
 * task is still in flight as far as we can tell, and reporting FAILED would
 * throw away a job the provider is still working on.
 */
function mapStatus(
  raw: string,
): 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' {
  const value = raw.trim().toLowerCase()
  if (value === 'succeeded' || value === 'success') return 'COMPLETED'
  if (
    value === 'failed' ||
    value === 'fail' ||
    value === 'cancelled' ||
    value === 'canceled' ||
    value === 'expired'
  ) {
    return 'FAILED'
  }
  if (value === 'processing' || value === 'generating' || value === 'running') {
    return 'IN_PROGRESS'
  }
  return 'IN_QUEUE'
}

function normalizeDuration(duration: number | 'auto' | undefined): number {
  if (typeof duration !== 'number' || !Number.isFinite(duration)) {
    return MINIMAX_DEFAULT_DURATION
  }
  const rounded = Math.round(duration)
  return Math.min(MINIMAX_MAX_DURATION, Math.max(MINIMAX_MIN_DURATION, rounded))
}

type ContentEntry = Record<string, unknown>

export interface MiniMaxContentInput {
  prompt: string
  referenceImage?: string
  referenceImages?: string[]
  videoUrls?: string[]
  audioUrls?: string[]
  requiresReferenceImage: boolean
}

/**
 * Build the multimodal `content` array.
 *
 * Order is load-bearing: the prompt refers to references as "Image 1",
 * "Video 1", "Audio 1" by their position within their own modality, so entries
 * must be appended in the caller's order and never reshuffled.
 */
export function buildMiniMaxContent(
  input: MiniMaxContentInput,
): ContentEntry[] {
  const content: ContentEntry[] = [{ type: 'text', text: input.prompt }]

  const images = input.referenceImages?.length
    ? input.referenceImages
    : input.referenceImage
      ? [input.referenceImage]
      : []

  let budget = MINIMAX_MAX_REFERENCE_FILES
  const take = <T>(list: readonly T[], cap: number): T[] => {
    const slice = list.slice(0, Math.min(cap, budget))
    budget -= slice.length
    return slice
  }

  if (input.requiresReferenceImage) {
    for (const url of take(images, MINIMAX_MAX_REFERENCE_IMAGES)) {
      content.push({
        type: 'image_url',
        image_url: { url },
        role: 'reference_image',
      })
    }
    for (const url of take(
      input.videoUrls ?? [],
      MINIMAX_MAX_REFERENCE_VIDEOS,
    )) {
      content.push({
        type: 'video_url',
        video_url: { url },
        role: 'reference_video',
      })
    }
    // Audio may never be the only reference — the provider 400s on an
    // audio-only payload, so drop the clips rather than send a doomed request.
    const hasVisualReference = content.some(
      (entry) => entry.type === 'image_url' || entry.type === 'video_url',
    )
    if (hasVisualReference) {
      for (const url of take(
        input.audioUrls ?? [],
        MINIMAX_MAX_REFERENCE_AUDIO,
      )) {
        content.push({
          type: 'audio_url',
          audio_url: { url },
          role: 'reference_audio',
        })
      }
    }
    return content
  }

  // Base (non-reference) face: a single image becomes the opening frame.
  const [firstFrame] = images
  if (firstFrame) {
    content.push({
      type: 'image_url',
      image_url: { url: firstFrame },
      role: 'first_frame',
    })
  }
  return content
}

/**
 * The `-reference` catalog ids are the multimodal face; the base ids only take
 * a first frame. Deciding from the model id — not from what happens to be in
 * the payload — keeps the wire shape stable when a reference run has exactly
 * one image. Must match `isMiniMaxReferenceModel` in the worker builder.
 */
export function isMiniMaxReferenceModel(modelId: string): boolean {
  return modelId.includes('-reference')
}

export interface MiniMaxQueueBodyInput {
  prompt: string
  modelId: string
  externalModelId?: string
  aspectRatio: string
  duration?: number | 'auto'
  referenceImage?: string
  referenceImages?: string[]
  videoUrls?: string[]
  audioUrls?: string[]
}

/**
 * Full request body for POST /video_generation. Exported so it can be tested
 * without a network round-trip, mirroring `buildVolcEngineVideoQueueBody`.
 * Keep in sync with `buildMiniMaxVideoRequest` in the execution worker.
 */
export function buildMiniMaxVideoQueueBody(
  input: MiniMaxQueueBodyInput,
): Record<string, unknown> {
  return {
    model: input.externalModelId ?? MINIMAX_EXECUTION_MODEL_ID,
    content: buildMiniMaxContent({
      prompt: input.prompt,
      referenceImage: input.referenceImage,
      referenceImages: input.referenceImages,
      videoUrls: input.videoUrls,
      audioUrls: input.audioUrls,
      requiresReferenceImage: isMiniMaxReferenceModel(input.modelId),
    }),
    duration: normalizeDuration(input.duration),
    // H3 has exactly one output resolution; sending anything else 400s.
    resolution: MINIMAX_RESOLUTION,
    ratio: input.aspectRatio,
  }
}

// ─── Adapter ─────────────────────────────────────────────────────

const minimaxVideoImplementation = {
  async generateImage(): Promise<ProviderGenerationResult> {
    throw new ProviderError(
      'MiniMax',
      400,
      'Image generation is not supported by the MiniMax adapter (video only).',
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
    referenceImages,
    videoUrls,
    audioUrls,
  }: ProviderQueueSubmitInput) {
    const baseUrl = buildBaseUrl(providerConfig.baseUrl)
    const endpoint = `${baseUrl}/video_generation`

    // No externalModelId here: ProviderQueueSubmitInput doesn't carry one, and
    // every H3 catalog entry executes as the same id anyway.
    const body = buildMiniMaxVideoQueueBody({
      prompt,
      modelId,
      aspectRatio,
      duration,
      referenceImage,
      referenceImages,
      videoUrls,
      audioUrls,
    })

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: buildHeaders(apiKey),
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error')
      logger.error('MiniMax submitVideoToQueue failed', {
        status: response.status,
        modelId,
        endpoint,
        errorBody: errorBody.slice(0, 1000),
      })
      throw new ProviderError(
        'MiniMax',
        response.status,
        formatMiniMaxError(response.status, errorBody),
      )
    }

    const data = MINIMAX_SUBMIT_SCHEMA.parse(await response.json())
    const statusUrl = `${baseUrl}/query/video_generation/${data.task_id}`

    return {
      requestId: data.task_id,
      statusUrl,
      responseUrl: statusUrl,
    }
  },

  async checkVideoQueueStatus({ statusUrl, apiKey }: ProviderQueueStatusInput) {
    const response = await fetch(statusUrl, {
      method: 'GET',
      headers: buildHeaders(apiKey),
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error')
      logger.error('MiniMax checkVideoQueueStatus failed', {
        status: response.status,
        statusUrl,
        errorBody: errorBody.slice(0, 1000),
      })
      throw new ProviderError(
        'MiniMax',
        response.status,
        formatMiniMaxError(response.status, errorBody),
      )
    }

    const { task } = MINIMAX_STATUS_SCHEMA.parse(await response.json())
    const status = mapStatus(task.status)

    if (status === 'COMPLETED') {
      const videoUrl = task.content?.url
      if (!videoUrl) {
        throw new ProviderError(
          'MiniMax',
          502,
          'Task succeeded but no video URL in response',
        )
      }
      // The query response carries no ratio, so dimensions come from the
      // 16:9 default rather than a guess at what was requested.
      const dimensions = MINIMAX_2K_DIMENSIONS['16:9']
      return {
        status: 'COMPLETED' as const,
        result: {
          videoUrl,
          width: dimensions.width,
          height: dimensions.height,
          duration: MINIMAX_DEFAULT_DURATION,
          requestCount: API_USAGE.DEFAULT_REQUESTS_PER_GENERATION,
        },
      }
    }

    if (status === 'FAILED') {
      throw new ProviderError(
        'MiniMax',
        502,
        task.error ?? `Video generation ${task.status}`,
      )
    }

    return { status }
  },

  async healthCheck({ apiKey, baseUrl, timeoutMs }: HealthCheckInput) {
    const start = Date.now()
    // MiniMax exposes no cheap "list models" route, so the probe is a query for
    // a task id that cannot exist: 401/403 means the key is bad, while a 4xx
    // "not found" style answer proves the key authenticated fine.
    const root = (baseUrl || AI_PROVIDER_ENDPOINTS.MINIMAX).replace(/\/$/, '')
    const url = `${root}/query/video_generation/healthcheck-probe`

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(timeoutMs),
      })

      const latencyMs = Date.now() - start
      if (response.status === 401 || response.status === 403) {
        return {
          status: 'unavailable' as const,
          latencyMs,
          error: `HTTP ${response.status}`,
        }
      }
      return { status: 'available' as const, latencyMs }
    } catch (err) {
      return {
        status: 'unavailable' as const,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : 'Unknown error',
      }
    }
  },
} satisfies Omit<ProviderAdapter, 'adapterType'>

/** Global station — api.minimax.io. */
export const minimaxAdapter: ProviderAdapter = {
  adapterType: AI_ADAPTER_TYPES.MINIMAX,
  ...minimaxVideoImplementation,
}

/** 国内站 — api.minimaxi.com. Same wire format, separate key slot. */
export const minimaxCnAdapter: ProviderAdapter = {
  adapterType: AI_ADAPTER_TYPES.MINIMAX_CN,
  ...minimaxVideoImplementation,
}
