/**
 * MiniMax H3 video request builder (execution worker side).
 *
 * Mirrors `src/services/providers/minimax.adapter.ts`. The duplication is the
 * house convention — the worker is a separate bundle and cannot import from
 * `src/`, exactly like `models/fal/video-request-builders.ts` duplicates
 * `services/providers/fal/video-request-builders.ts`. Keep the two in sync.
 *
 * Wire shape:
 *   POST {base}/video_generation                → { task_id }
 *   GET  {base}/query/video_generation/{taskId} → { task: { status, content:{url} } }
 */

export const MINIMAX_GLOBAL_PROVIDER_ID = 'minimax'
export const MINIMAX_CN_PROVIDER_ID = 'minimax_cn'

/**
 * The two stations are separate deployments with separate accounts and
 * non-interchangeable keys, so the base URL is picked from the provider id
 * rather than carried in the run context.
 */
const MINIMAX_BASE_URLS: Record<string, string> = {
  [MINIMAX_GLOBAL_PROVIDER_ID]: 'https://api.minimax.io/v2',
  [MINIMAX_CN_PROVIDER_ID]: 'https://api.minimaxi.com/v2',
}

export function isMiniMaxProviderId(providerId: string): boolean {
  return Object.prototype.hasOwnProperty.call(MINIMAX_BASE_URLS, providerId)
}

export function miniMaxBaseUrl(providerId: string): string {
  const baseUrl = MINIMAX_BASE_URLS[providerId]
  if (!baseUrl) {
    throw new Error(`Unknown MiniMax provider id: ${providerId}`)
  }
  return baseUrl
}

const MIN_DURATION = 4
const MAX_DURATION = 15
const DEFAULT_DURATION = 5

/** H3 emits 2K and nothing else; any other value is a 400. */
const RESOLUTION = '2K'

/**
 * Per-modality caps plus a hard total across all three — the provider enforces
 * both, so clamp here rather than eat a 400.
 */
const MAX_REFERENCE_IMAGES = 9
const MAX_REFERENCE_VIDEOS = 3
const MAX_REFERENCE_AUDIO = 3
const MAX_REFERENCE_FILES = 12

export interface MiniMaxVideoBuilderInput {
  prompt: string
  modelId: string
  externalModelId: string
  aspectRatio: string
  duration?: number | 'auto'
  referenceImage?: string
  referenceImages?: string[]
  videoUrls?: string[]
  audioUrls?: string[]
}

function normalizeDuration(duration: number | 'auto' | undefined): number {
  if (typeof duration !== 'number' || !Number.isFinite(duration)) {
    return DEFAULT_DURATION
  }
  return Math.min(MAX_DURATION, Math.max(MIN_DURATION, Math.round(duration)))
}

/**
 * The `-reference` catalog ids are the multimodal face; the base ids only take
 * a first frame. Deciding from the model id (not from what happens to be in the
 * payload) keeps the wire shape stable when a reference run has one image.
 */
export function isMiniMaxReferenceModel(modelId: string): boolean {
  return modelId.includes('-reference')
}

type ContentEntry = Record<string, unknown>

export function buildMiniMaxVideoRequest(
  input: MiniMaxVideoBuilderInput,
): Record<string, unknown> {
  const content: ContentEntry[] = [{ type: 'text', text: input.prompt }]

  const images =
    input.referenceImages && input.referenceImages.length > 0
      ? input.referenceImages
      : input.referenceImage
        ? [input.referenceImage]
        : []

  let budget = MAX_REFERENCE_FILES
  const take = <T>(list: readonly T[], cap: number): T[] => {
    const slice = list.slice(0, Math.min(cap, budget))
    budget -= slice.length
    return slice
  }

  if (isMiniMaxReferenceModel(input.modelId)) {
    // Order is load-bearing: the prompt cites references as "Image 1",
    // "Video 1", "Audio 1" by position within their own modality.
    for (const url of take(images, MAX_REFERENCE_IMAGES)) {
      content.push({
        type: 'image_url',
        image_url: { url },
        role: 'reference_image',
      })
    }
    for (const url of take(input.videoUrls ?? [], MAX_REFERENCE_VIDEOS)) {
      content.push({
        type: 'video_url',
        video_url: { url },
        role: 'reference_video',
      })
    }
    // Audio may never be the only reference — an audio-only payload 400s, so
    // drop the clips rather than send a request that cannot succeed.
    const hasVisualReference = content.some(
      (entry) => entry.type === 'image_url' || entry.type === 'video_url',
    )
    if (hasVisualReference) {
      for (const url of take(input.audioUrls ?? [], MAX_REFERENCE_AUDIO)) {
        content.push({
          type: 'audio_url',
          audio_url: { url },
          role: 'reference_audio',
        })
      }
    }
  } else {
    const firstFrame = images[0]
    if (firstFrame) {
      content.push({
        type: 'image_url',
        image_url: { url: firstFrame },
        role: 'first_frame',
      })
    }
  }

  return {
    model: input.externalModelId,
    content,
    duration: normalizeDuration(input.duration),
    resolution: RESOLUTION,
    ratio: input.aspectRatio,
  }
}

/**
 * Unknown → IN_QUEUE on purpose. MiniMax documents succeeded/failed/cancelled/
 * expired plus unnamed intermediate states; treating an unrecognised value as
 * terminal would abandon a job the provider is still working on.
 */
export function mapMiniMaxStatus(
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
