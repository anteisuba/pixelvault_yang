/**
 * VolcEngine (火山方舟) Seedance video request builder — execution worker side.
 *
 * Mirrors `buildVolcEngineVideoQueueBody` in
 * `src/services/providers/volcengine.adapter.ts`. The duplication is the house
 * convention: the worker is a separate bundle and cannot import from `src/`.
 * Keep the two in sync.
 *
 * Wire shape (https://www.volcengine.com/docs/82379/1520757):
 *   POST {base}/contents/generations/tasks      → { id }
 *   GET  {base}/contents/generations/tasks/{id} → { status, content:{ video_url } }
 */

export const VOLCENGINE_PROVIDER_ID = 'volcengine'

/** Ark, cn-beijing. Overridden by `providerInput.providerBaseUrl` when present. */
export const VOLCENGINE_DEFAULT_BASE_URL =
  'https://ark.cn-beijing.volces.com/api/v3'

export function isVolcEngineProviderId(providerId: string): boolean {
  return providerId === VOLCENGINE_PROVIDER_ID
}

const MAX_SEED = 2_147_483_647

/**
 * Seedance 2.0 series duration window, per 火山's model list (时长: 4~15 秒).
 * ⚠ Not 2~12 — that was the 1.0-pro window, and clamping to it silently
 * truncated a 15s request to 12s.
 */
const MIN_DURATION = 4
const MAX_DURATION = 15
const DEFAULT_DURATION = 5

/** Multimodal caps: ≤9 reference images, ≤3 videos, ≤3 audio clips. */
const MAX_REFERENCE_IMAGES = 9
const MAX_REFERENCE_VIDEOS = 3
const MAX_REFERENCE_AUDIO = 3

/** The fast tier tops out at 720p; asking for 1080p there is a 400. */
const FAST_MODEL_IDS = new Set([
  'seedance-2.0-fast-volc',
  'doubao-seedance-2-0-fast-260128',
  'doubao-seedance-2-0-mini-260615',
])

export interface VolcEngineVideoBuilderInput {
  prompt: string
  modelId: string
  externalModelId: string
  aspectRatio?: string
  duration?: number | 'auto'
  referenceImage?: string
  referenceImages?: string[]
  videoUrls?: string[]
  audioUrls?: string[]
  resolution?: string
  videoDefaults?: Record<string, unknown>
  generateAudio?: boolean
  seed?: number
}

function readVideoDefault(
  videoDefaults: Record<string, unknown> | undefined,
  key: string,
): unknown {
  return videoDefaults ? videoDefaults[key] : undefined
}

function resolveResolution(
  externalModelId: string,
  requested: string | undefined,
): string | undefined {
  if (FAST_MODEL_IDS.has(externalModelId) && requested === '1080p') {
    return '720p'
  }
  return requested
}

export function buildVolcEngineVideoRequest(
  input: VolcEngineVideoBuilderInput,
): Record<string, unknown> {
  const content: Record<string, unknown>[] = [
    { type: 'text', text: input.prompt },
  ]

  const referenceImageUrls =
    input.referenceImages && input.referenceImages.length > 0
      ? input.referenceImages
      : input.referenceImage
        ? [input.referenceImage]
        : []
  const referenceVideoUrls = (input.videoUrls ?? []).slice(
    0,
    MAX_REFERENCE_VIDEOS,
  )
  const referenceAudioUrls = (input.audioUrls ?? []).slice(
    0,
    MAX_REFERENCE_AUDIO,
  )

  // ark forbids mixing its three scenarios (first-frame i2v / first+last frame /
  // multimodal reference). Reference mode activates on multiple images or any
  // reference video/audio; a lone image with nothing else stays a classic
  // first-frame i2v so existing single-image behaviour is preserved.
  const useReferenceMode =
    referenceImageUrls.length > 1 ||
    referenceVideoUrls.length > 0 ||
    referenceAudioUrls.length > 0

  if (useReferenceMode) {
    for (const url of referenceImageUrls.slice(0, MAX_REFERENCE_IMAGES)) {
      content.push({
        type: 'image_url',
        image_url: { url },
        role: 'reference_image',
      })
    }
    for (const url of referenceVideoUrls) {
      content.push({
        type: 'video_url',
        video_url: { url },
        role: 'reference_video',
      })
    }
    // ark rule: reference audio cannot be the sole input — it must accompany at
    // least one reference image or video, otherwise the request is rejected.
    if (referenceImageUrls.length > 0 || referenceVideoUrls.length > 0) {
      for (const url of referenceAudioUrls) {
        content.push({
          type: 'audio_url',
          audio_url: { url },
          role: 'reference_audio',
        })
      }
    }
  } else if (referenceImageUrls.length === 1) {
    content.push({
      type: 'image_url',
      image_url: { url: referenceImageUrls[0] },
      role: 'first_frame',
    })
  }

  const body: Record<string, unknown> = {
    model: input.externalModelId,
    content,
  }

  if (input.aspectRatio) {
    body.ratio = input.aspectRatio
  }

  // ark has no 'auto' literal — coerce it to the default.
  body.duration =
    typeof input.duration === 'number'
      ? Math.min(
          MAX_DURATION,
          Math.max(MIN_DURATION, Math.round(input.duration)),
        )
      : DEFAULT_DURATION

  const requestedResolution =
    input.resolution ??
    (readVideoDefault(input.videoDefaults, 'resolution') as string | undefined)
  const effectiveResolution = resolveResolution(
    input.externalModelId,
    requestedResolution,
  )
  if (effectiveResolution) {
    body.resolution = effectiveResolution
  }

  const generateAudio =
    input.generateAudio ??
    (readVideoDefault(input.videoDefaults, 'generateAudio') as
      | boolean
      | undefined)
  if (generateAudio != null) {
    body.generate_audio = generateAudio
  }

  if (typeof input.seed === 'number' && input.seed >= 0) {
    body.seed = Math.min(input.seed, MAX_SEED)
  }

  body.return_last_frame = true
  body.watermark = false

  return body
}

/** ark task status → the worker's unified queue status. */
export function mapVolcEngineStatus(
  raw: string,
): 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' {
  switch (raw) {
    case 'succeeded':
      return 'COMPLETED'
    case 'running':
      return 'IN_PROGRESS'
    case 'failed':
    case 'expired':
      return 'FAILED'
    default:
      // 'queued' and anything undocumented — keep polling rather than abandon a
      // task the provider may still be working on.
      return 'IN_QUEUE'
  }
}
