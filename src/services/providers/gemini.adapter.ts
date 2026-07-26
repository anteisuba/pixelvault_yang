import 'server-only'

import { z } from 'zod'

import {
  API_USAGE,
  AI_PROVIDER_ENDPOINTS,
  IMAGE_SIZES,
} from '@/constants/config'
import { getExecutionModelId } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { fetchAsBuffer } from '@/services/storage/r2'

import {
  ProviderError,
  type HealthCheckInput,
  type ProviderAdapter,
  type ProviderGenerationInput,
  type ProviderQueueStatusInput,
  type ProviderQueueSubmitInput,
} from '@/services/providers/types'
import { logger } from '@/lib/logger'

const GEMINI_IMAGE_RESPONSE_SCHEMA = z.object({
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

const GEMINI_ASPECT_RATIOS = {
  '1:1': '1:1',
  '16:9': '16:9',
  '9:16': '9:16',
  '4:3': '4:3',
  '3:4': '3:4',
} as const

async function getGeminiReferencePart(referenceImage: string) {
  const dataUrlMatch = referenceImage.match(/^data:([^;]+);base64,(.+)$/)

  if (dataUrlMatch) {
    return {
      inlineData: {
        mimeType: dataUrlMatch[1],
        data: dataUrlMatch[2],
      },
    }
  }

  const { buffer, mimeType } = await fetchAsBuffer(referenceImage)

  return {
    inlineData: {
      mimeType,
      data: buffer.toString('base64'),
    },
  }
}

// ─── Interactions API (Gemini Omni video) ───────────────────────
//
// Video models do NOT run on `:generateContent`. They use the Interactions
// API — a create/poll surface at /v1beta/interactions that maps cleanly onto
// this project's submitVideoToQueue + checkVideoQueueStatus contract.
//
// Output is requested with `delivery: 'uri'` so the pipeline receives a
// fetchable URL rather than a multi-MB base64 blob. That URL is a Files API
// handle which needs the API key to download — hence `fetchHeaders` on the
// result (same pattern the OpenAI Sora path uses).

const GEMINI_INTERACTION_CONTENT_SCHEMA = z.object({
  type: z.string().optional(),
  mime_type: z.string().optional(),
  data: z.string().optional(),
  uri: z.string().optional(),
})

const GEMINI_INTERACTION_SCHEMA = z.object({
  id: z.string().min(1),
  status: z.string().optional(),
  error: z.object({ message: z.string().optional() }).partial().optional(),
  steps: z
    .array(
      z.object({
        type: z.string().optional(),
        content: z.array(GEMINI_INTERACTION_CONTENT_SCHEMA).optional(),
      }),
    )
    .optional(),
})

const GEMINI_FILE_SCHEMA = z.object({
  name: z.string().optional(),
  state: z.string().optional(),
  mimeType: z.string().optional(),
})

/** Submitting is cheap — the long wait happens in the poll loop. */
const GEMINI_VIDEO_SUBMIT_TIMEOUT_MS = 60_000

/**
 * Omni Flash renders 720p. The poll response carries no pixel dimensions and
 * `checkVideoQueueStatus` never sees the requested aspect ratio, so landscape
 * 720p is the reported default — portrait clips will be labelled 1280x720 even
 * though the file itself is 720x1280.
 */
const GEMINI_OMNI_VIDEO_WIDTH = 1280
const GEMINI_OMNI_VIDEO_HEIGHT = 720
/** Docs state 3–10s output with no duration parameter to pin it down. */
const GEMINI_OMNI_NOMINAL_DURATION_SECONDS = 8

/** Interaction lifecycle → the unified queue status this project polls on. */
const GEMINI_INTERACTION_STATUS_MAP: Record<
  string,
  'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'
> = {
  queued: 'IN_QUEUE',
  in_progress: 'IN_PROGRESS',
  requires_action: 'IN_PROGRESS',
  completed: 'COMPLETED',
  failed: 'FAILED',
  cancelled: 'FAILED',
  incomplete: 'FAILED',
  budget_exceeded: 'FAILED',
}

/** Omni video only renders 16:9 or 9:16 — collapse anything else by orientation. */
function toGeminiVideoAspectRatio(aspectRatio: string): '16:9' | '9:16' {
  const [rawWidth, rawHeight] = aspectRatio.split(':').map(Number)
  const width = Number.isFinite(rawWidth) ? rawWidth : 1
  const height = Number.isFinite(rawHeight) ? rawHeight : 1
  return width >= height ? '16:9' : '9:16'
}

/** Reference image → an Interactions API `image` content part. */
async function getGeminiVideoImagePart(referenceImage: string) {
  const { inlineData } = await getGeminiReferencePart(referenceImage)
  return {
    type: 'image',
    mime_type: inlineData.mimeType,
    data: inlineData.data,
  }
}

function findGeminiVideoContent(
  interaction: z.infer<typeof GEMINI_INTERACTION_SCHEMA>,
) {
  for (const step of interaction.steps ?? []) {
    for (const content of step.content ?? []) {
      if (content.type === 'video' && (content.uri || content.data)) {
        return content
      }
    }
  }
  return undefined
}

/** Pull the Files API id out of whatever URI shape the response carries. */
function extractGeminiFileId(uri: string): string | null {
  return uri.match(/files\/([^/:?#]+)/)?.[1] ?? null
}

export const geminiAdapter: ProviderAdapter = {
  adapterType: AI_ADAPTER_TYPES.GEMINI,
  async generateImage({
    prompt,
    modelId,
    externalModelId,
    aspectRatio,
    providerConfig,
    apiKey,
    referenceImage,
    referenceImages,
  }: ProviderGenerationInput) {
    const { width, height } = IMAGE_SIZES[aspectRatio] ?? IMAGE_SIZES['1:1']
    const baseUrl = providerConfig.baseUrl || AI_PROVIDER_ENDPOINTS.GEMINI
    const endpoint = `${baseUrl}/${externalModelId ?? getExecutionModelId(modelId)}:generateContent`
    const parts: Array<Record<string, unknown>> = [{ text: prompt }]

    // Multi-reference images: Gemini Pro supports up to 14 reference images
    const allRefs = referenceImages?.length
      ? referenceImages
      : referenceImage
        ? [referenceImage]
        : []

    for (const ref of allRefs) {
      parts.push(await getGeminiReferencePart(ref))
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: {
            aspectRatio: GEMINI_ASPECT_RATIOS[aspectRatio] ?? '1:1',
          },
        },
      }),
      // 60s cap. A healthy Gemini call returns in 5–15s. The previous
      // 230s budget meant a slow-rolling 503 ("experiencing high demand")
      // could hang the user for 4+ minutes once retries were factored in.
      signal: AbortSignal.timeout(60_000),
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error')
      logger.error('Gemini generateImage failed', {
        status: response.status,
        modelId,
        errorBody: errorBody.slice(0, 500),
      })
      throw new ProviderError('Gemini', response.status, errorBody)
    }

    const responseData = GEMINI_IMAGE_RESPONSE_SCHEMA.parse(
      await response.json(),
    )
    const responseParts = responseData.candidates?.[0]?.content?.parts
    const imagePart = responseParts?.find((part) => part.inlineData)

    if (!imagePart?.inlineData) {
      throw new ProviderError('Gemini', 502, 'No image data returned')
    }

    return {
      imageUrl: `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`,
      width,
      height,
      requestCount: API_USAGE.DEFAULT_REQUESTS_PER_GENERATION,
    }
  },

  async submitVideoToQueue({
    prompt,
    modelId,
    aspectRatio,
    apiKey,
    referenceImage,
    referenceImages,
  }: ProviderQueueSubmitInput) {
    const allRefs = referenceImages?.length
      ? referenceImages
      : referenceImage
        ? [referenceImage]
        : []

    const input: Array<Record<string, unknown>> = [
      { type: 'text', text: prompt },
    ]
    for (const ref of allRefs) {
      input.push(await getGeminiVideoImagePart(ref))
    }

    const response = await fetch(AI_PROVIDER_ENDPOINTS.GEMINI_INTERACTIONS, {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: getExecutionModelId(modelId),
        input,
        response_format: {
          type: 'video',
          aspect_ratio: toGeminiVideoAspectRatio(aspectRatio),
          delivery: 'uri',
        },
        video_config: {
          task: allRefs.length > 0 ? 'image_to_video' : 'text_to_video',
        },
      }),
      signal: AbortSignal.timeout(GEMINI_VIDEO_SUBMIT_TIMEOUT_MS),
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error')
      logger.error('Gemini submitVideoToQueue failed', {
        status: response.status,
        modelId,
        errorBody: errorBody.slice(0, 1000),
      })
      throw new ProviderError('Gemini', response.status, errorBody)
    }

    const interaction = GEMINI_INTERACTION_SCHEMA.parse(await response.json())
    const statusUrl = `${AI_PROVIDER_ENDPOINTS.GEMINI_INTERACTIONS}/${interaction.id}`

    return {
      requestId: interaction.id,
      statusUrl,
      responseUrl: statusUrl,
    }
  },

  async checkVideoQueueStatus({ statusUrl, apiKey }: ProviderQueueStatusInput) {
    const response = await fetch(statusUrl, {
      method: 'GET',
      headers: { 'x-goog-api-key': apiKey },
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error')
      logger.error('Gemini checkVideoQueueStatus failed', {
        status: response.status,
        statusUrl,
        errorBody: errorBody.slice(0, 1000),
      })
      throw new ProviderError('Gemini', response.status, errorBody)
    }

    const interaction = GEMINI_INTERACTION_SCHEMA.parse(await response.json())
    const status =
      GEMINI_INTERACTION_STATUS_MAP[interaction.status ?? ''] ?? 'IN_QUEUE'

    if (status === 'FAILED') {
      return {
        status,
        error:
          interaction.error?.message ??
          `Interaction ended as ${interaction.status ?? 'unknown'}`,
      }
    }

    if (status !== 'COMPLETED') {
      return { status }
    }

    const video = findGeminiVideoContent(interaction)
    if (!video) {
      // Pass an explicit message: humanizeProviderError would turn a 502 into
      // "temporarily unavailable", and a response-shape mismatch is not
      // something retrying fixes.
      const detail = 'Interaction completed but carried no video content'
      throw new ProviderError('Gemini', 502, detail, { message: detail })
    }

    const result = {
      width: GEMINI_OMNI_VIDEO_WIDTH,
      height: GEMINI_OMNI_VIDEO_HEIGHT,
      duration: GEMINI_OMNI_NOMINAL_DURATION_SECONDS,
      requestCount: API_USAGE.DEFAULT_REQUESTS_PER_GENERATION,
    }

    // Inline delivery — only reachable if the API ignores `delivery: 'uri'`
    // (small clips). Hand back a data URL the storage layer can consume.
    if (!video.uri && video.data) {
      return {
        status: 'COMPLETED' as const,
        result: {
          ...result,
          videoUrl: `data:${video.mime_type ?? 'video/mp4'};base64,${video.data}`,
        },
      }
    }

    const fileId = video.uri ? extractGeminiFileId(video.uri) : null
    if (!fileId) {
      const detail = `Unrecognised video URI in interaction response: ${video.uri ?? '(none)'}`
      throw new ProviderError('Gemini', 502, detail, { message: detail })
    }

    // A Files entry is not downloadable until it reaches ACTIVE. Report
    // IN_PROGRESS so the existing poll loop comes back rather than handing the
    // pipeline a URL that 403s.
    const fileUrl = `${AI_PROVIDER_ENDPOINTS.GEMINI_FILES}/${fileId}`
    const fileResponse = await fetch(fileUrl, {
      method: 'GET',
      headers: { 'x-goog-api-key': apiKey },
    })

    if (!fileResponse.ok) {
      const errorBody = await fileResponse.text().catch(() => 'Unknown error')
      logger.error('Gemini video file lookup failed', {
        status: fileResponse.status,
        fileUrl,
        errorBody: errorBody.slice(0, 500),
      })
      throw new ProviderError('Gemini', fileResponse.status, errorBody)
    }

    const file = GEMINI_FILE_SCHEMA.parse(await fileResponse.json())

    if (file.state === 'FAILED') {
      return {
        status: 'FAILED' as const,
        error: 'Gemini finished the interaction but the video file failed',
      }
    }

    if (file.state !== 'ACTIVE') {
      return { status: 'IN_PROGRESS' as const }
    }

    return {
      status: 'COMPLETED' as const,
      result: {
        ...result,
        videoUrl: `${fileUrl}:download?alt=media`,
        // Files API downloads are authenticated — the storage layer must
        // replay the key when it fetches this URL.
        fetchHeaders: { 'x-goog-api-key': apiKey },
      },
    }
  },

  async healthCheck({ modelId, apiKey, baseUrl, timeoutMs }: HealthCheckInput) {
    const start = Date.now()
    try {
      const endpoint = `${baseUrl}/${modelId}`
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: { 'x-goog-api-key': apiKey },
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
