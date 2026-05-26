import 'server-only'

import { z } from 'zod'

import {
  API_USAGE,
  AI_PROVIDER_ENDPOINTS,
  RUNWAY_API,
  type AspectRatio,
} from '@/constants/config'
import { getExecutionModelId } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

import {
  ProviderError,
  type HealthCheckInput,
  type ProviderAdapter,
  type ProviderGenerationResult,
  type ProviderQueueStatusInput,
  type ProviderQueueSubmitInput,
  type ProviderVideoResult,
} from '@/services/providers/types'

const RUNWAY_VIDEO_RATIOS: Record<AspectRatio, string> = {
  '16:9': '1280:720',
  '9:16': '720:1280',
  '1:1': '960:960',
  '4:3': '1104:832',
  '3:4': '832:1104',
}

const RUNWAY_TEXT_TO_VIDEO_ASPECT_RATIOS = new Set<AspectRatio>([
  '16:9',
  '9:16',
])

const RUNWAY_SUBMIT_RESPONSE_SCHEMA = z.object({
  id: z.string().uuid(),
})

const RUNWAY_TASK_STATUS_SCHEMA = z
  .object({
    id: z.string().uuid(),
    status: z.enum([
      'PENDING',
      'THROTTLED',
      'RUNNING',
      'SUCCEEDED',
      'FAILED',
      'CANCELLED',
    ]),
    output: z.array(z.string().url()).optional(),
    failure: z.string().optional(),
    failureCode: z.string().optional(),
  })
  .passthrough()

function resolveRunwayBaseUrl(baseUrl: string | undefined): string {
  return (baseUrl || AI_PROVIDER_ENDPOINTS.RUNWAY).replace(/\/$/, '')
}

function buildRunwayHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'X-Runway-Version': RUNWAY_API.VERSION,
  }
}

function getRunwayRatio(aspectRatio: AspectRatio): string {
  return RUNWAY_VIDEO_RATIOS[aspectRatio] ?? RUNWAY_VIDEO_RATIOS['16:9']
}

function parseRunwayRatio(ratio: string): { width: number; height: number } {
  const [width, height] = ratio.split(':').map(Number)
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return { width: 1280, height: 720 }
  }
  return { width, height }
}

function getRunwayTaskStatusUrl(baseUrl: string, taskId: string): string {
  return `${baseUrl}${RUNWAY_API.TASKS_PATH}/${taskId}`
}

function buildRunwayResultMetaUrl(params: {
  statusUrl: string
  width: number
  height: number
  duration: number
}): string {
  const url = new URL(params.statusUrl)
  url.searchParams.set('width', String(params.width))
  url.searchParams.set('height', String(params.height))
  url.searchParams.set('duration', String(params.duration))
  return url.toString()
}

function readRunwayResultMeta(responseUrl: string): {
  width: number
  height: number
  duration: number
} {
  const url = new URL(responseUrl)
  const width = Number(url.searchParams.get('width'))
  const height = Number(url.searchParams.get('height'))
  const duration = Number(url.searchParams.get('duration'))

  return {
    width: Number.isFinite(width) && width > 0 ? width : 1280,
    height: Number.isFinite(height) && height > 0 ? height : 720,
    duration: Number.isFinite(duration) && duration > 0 ? duration : 5,
  }
}

function getRunwaySubmitPath(params: {
  externalModelId: string
  referenceImage?: string
  aspectRatio: AspectRatio
}): string {
  if (params.referenceImage) return RUNWAY_API.IMAGE_TO_VIDEO_PATH

  if (params.externalModelId === 'gen4_turbo') {
    throw new ProviderError(
      'Runway',
      400,
      'Runway Gen-4 Turbo requires a reference image.',
    )
  }

  if (
    params.externalModelId === 'gen4.5' &&
    !RUNWAY_TEXT_TO_VIDEO_ASPECT_RATIOS.has(params.aspectRatio)
  ) {
    throw new ProviderError(
      'Runway',
      400,
      'Runway Gen-4.5 text-to-video supports only 16:9 and 9:16.',
    )
  }

  return RUNWAY_API.IMAGE_TO_VIDEO_PATH
}

export const runwayAdapter: ProviderAdapter = {
  adapterType: AI_ADAPTER_TYPES.RUNWAY,

  async generateImage(): Promise<ProviderGenerationResult> {
    throw new ProviderError(
      'Runway',
      400,
      'Image generation is not supported by this Runway adapter.',
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
  }: ProviderQueueSubmitInput) {
    const baseUrl = resolveRunwayBaseUrl(providerConfig.baseUrl)
    const externalModelId = getExecutionModelId(modelId)
    const ratio = getRunwayRatio(aspectRatio)
    // Runway doesn't support the 'auto' literal — coerce to its default.
    const requestedDuration: number =
      typeof duration === 'number' ? duration : 5
    const submitPath = getRunwaySubmitPath({
      externalModelId,
      referenceImage,
      aspectRatio,
    })
    const body: Record<string, unknown> = {
      model: externalModelId,
      promptText: prompt,
      ratio,
      duration: requestedDuration,
    }

    if (referenceImage) {
      body.promptImage = referenceImage
    }

    const response = await fetch(`${baseUrl}${submitPath}`, {
      method: 'POST',
      headers: buildRunwayHeaders(apiKey),
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => 'Unknown error')
      throw new ProviderError('Runway', response.status, detail)
    }

    const parsed = RUNWAY_SUBMIT_RESPONSE_SCHEMA.parse(await response.json())
    const statusUrl = getRunwayTaskStatusUrl(baseUrl, parsed.id)
    const { width, height } = parseRunwayRatio(ratio)

    return {
      requestId: parsed.id,
      statusUrl,
      responseUrl: buildRunwayResultMetaUrl({
        statusUrl,
        width,
        height,
        duration: requestedDuration,
      }),
    }
  },

  async checkVideoQueueStatus({
    statusUrl,
    responseUrl,
    apiKey,
  }: ProviderQueueStatusInput) {
    const response = await fetch(statusUrl, {
      method: 'GET',
      headers: buildRunwayHeaders(apiKey),
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => 'Unknown error')
      throw new ProviderError('Runway', response.status, detail)
    }

    const task = RUNWAY_TASK_STATUS_SCHEMA.parse(await response.json())
    if (task.status === 'PENDING' || task.status === 'THROTTLED') {
      return { status: 'IN_QUEUE' }
    }
    if (task.status === 'RUNNING') {
      return { status: 'IN_PROGRESS' }
    }
    if (task.status === 'FAILED' || task.status === 'CANCELLED') {
      return { status: 'FAILED' }
    }

    const videoUrl = task.output?.[0]
    if (!videoUrl) {
      throw new ProviderError('Runway', 502, 'Runway returned no video URL.')
    }

    const meta = readRunwayResultMeta(responseUrl)
    const result: ProviderVideoResult = {
      videoUrl,
      width: meta.width,
      height: meta.height,
      duration: meta.duration,
      requestCount: API_USAGE.DEFAULT_REQUESTS_PER_GENERATION,
    }

    return {
      status: 'COMPLETED',
      result,
    }
  },

  async healthCheck({ apiKey, baseUrl, timeoutMs }: HealthCheckInput) {
    const start = Date.now()
    try {
      const response = await fetch(
        getRunwayTaskStatusUrl(
          resolveRunwayBaseUrl(baseUrl),
          RUNWAY_API.PROBE_TASK_ID,
        ),
        {
          method: 'GET',
          headers: buildRunwayHeaders(apiKey),
          signal: AbortSignal.timeout(timeoutMs),
        },
      )
      const latencyMs = Date.now() - start

      if (response.status === 401 || response.status === 403) {
        return {
          status: 'unavailable',
          latencyMs,
          error: `HTTP ${response.status}`,
        }
      }

      return { status: 'available', latencyMs }
    } catch (error) {
      return {
        status: 'unavailable',
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  },
}
