import 'server-only'

import { randomBytes } from 'crypto'

import { logger } from '@/lib/logger'
import { withRetry } from '@/lib/with-retry'
import { fetchAsBuffer, uploadToR2 } from '@/services/storage/r2'

/**
 * fal-ai/ffmpeg-api/merge-videos PoC numbers (run 2026-05-26):
 *   - 2 clips (5s + 5s, both 720p / 24fps) → 10s 1024×576 / 30fps output
 *   - 6 compute seconds @ $0.00017/sec = ~$0.001 / merge
 *   - 7.9s end-to-end (queue + processing + result fetch)
 *   - Audio tracks auto-merged with no extra params
 *   - 3 polls @ 3s interval was enough; we keep a generous attempt budget
 *     anyway in case ffmpeg-api gets slower for longer clips.
 */
const FAL_MERGE_ENDPOINT = 'fal-ai/ffmpeg-api/merge-videos'
/**
 * fal-ai/ffmpeg-api/compose schema (verified via OpenAPI 2026-05-26):
 *   tracks[] → keyframes[] → { timestamp, duration, url } (all ms)
 * Used when any clip wants a trim — the schema does not expose a source
 * offset, so the practical contract we ship today is "play each clip from
 * its source 0 for `duration` ms, sequenced on the output timeline by
 * `timestamp`". That covers tail-trim ("only play the first N seconds")
 * but not arbitrary head-trim. We surface startSec on the UI as best
 * effort — if fal ships a source-offset field later the service can switch
 * timestamp semantics without UI churn.
 */
const FAL_COMPOSE_ENDPOINT = 'fal-ai/ffmpeg-api/compose'
const FAL_QUEUE_BASE = 'https://queue.fal.run'

/** Max clips per merge — fal docs don't document an explicit upper bound, but
 * combined output ≤90s seems to be the soft cap. 9 matches our Seedance
 * image_urls cap so the two surfaces feel consistent. */
const MAX_MERGE_CLIPS = 9

const POLL_INTERVAL_MS = 3_000
const POLL_MAX_ATTEMPTS = 200 // safety cap; PoC completed in 3 polls

interface FalQueueSubmitResponse {
  request_id: string
  status_url: string
  response_url: string
}

interface FalQueueStatusResponse {
  status:
    | 'IN_QUEUE'
    | 'IN_PROGRESS'
    | 'COMPLETED'
    | 'FAILED'
    | 'CANCELLED'
    | 'ERROR'
}

interface FalMergeResultBody {
  video?: {
    url?: string
    content_type?: string
    file_name?: string
    file_size?: number
  }
  metadata?: {
    final_fps?: number
    final_width?: number
    final_height?: number
    total_duration?: number
    has_audio?: boolean
    video_count?: number
  }
}

export interface MergeVideoServiceInput {
  userId: string
  apiKey: string
  videoUrls: readonly string[]
  /** Optional target frame-rate. When omitted fal uses the lowest input fps. */
  targetFps?: number
  /** Optional output resolution. When omitted fal uses the lowest input. */
  resolution?: string
}

export interface ComposeClipInput {
  url: string
  /**
   * Trim the source clip to start at this many seconds in. fal compose
   * does not expose a source offset today — we accept it on the input so
   * the surface area is forward-compatible, but the service currently
   * treats startSec > 0 as informational only (logged, not honored).
   */
  startSec?: number
  /** Trim the source clip to end at this many seconds. */
  endSec?: number
  /**
   * The natural duration of the source clip, when known. Used to fill in
   * the keyframe duration when neither startSec nor endSec is supplied —
   * otherwise we assume the source-side measurement is opaque and fall
   * back to a per-endpoint sentinel ("play the full clip").
   */
  naturalDurationSec?: number
}

export interface ComposeVideoServiceInput {
  userId: string
  apiKey: string
  clips: readonly ComposeClipInput[]
}

export interface MergeVideoServiceResult {
  url: string
  storageKey: string
  sizeBytes: number
  mimeType: string
  width?: number
  height?: number
  durationSeconds?: number
  fps?: number
  requestId: string
}

export class MergeVideoServiceError extends Error {
  readonly code:
    | 'TOO_FEW_CLIPS'
    | 'TOO_MANY_CLIPS'
    | 'INVALID_URL'
    | 'FAL_SUBMIT_FAILED'
    | 'FAL_POLL_FAILED'
    | 'FAL_TIMED_OUT'
    | 'FAL_NO_OUTPUT'

  constructor(code: MergeVideoServiceError['code'], message: string) {
    super(message)
    this.name = 'MergeVideoServiceError'
    this.code = code
  }
}

function validateInput(input: MergeVideoServiceInput): void {
  if (input.videoUrls.length < 2) {
    throw new MergeVideoServiceError(
      'TOO_FEW_CLIPS',
      'At least 2 video URLs are required to merge.',
    )
  }
  if (input.videoUrls.length > MAX_MERGE_CLIPS) {
    throw new MergeVideoServiceError(
      'TOO_MANY_CLIPS',
      `Up to ${MAX_MERGE_CLIPS} clips can be merged per request.`,
    )
  }
  for (const url of input.videoUrls) {
    try {
      new URL(url)
    } catch {
      throw new MergeVideoServiceError(
        'INVALID_URL',
        `Invalid video URL: ${url}`,
      )
    }
  }
}

async function submitFalMerge(
  input: MergeVideoServiceInput,
): Promise<FalQueueSubmitResponse> {
  const body: Record<string, unknown> = {
    video_urls: [...input.videoUrls],
  }
  if (typeof input.targetFps === 'number') {
    body.target_fps = input.targetFps
  }
  if (input.resolution) {
    body.resolution = input.resolution
  }

  const response = await fetch(`${FAL_QUEUE_BASE}/${FAL_MERGE_ENDPOINT}`, {
    method: 'POST',
    headers: {
      Authorization: `Key ${input.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new MergeVideoServiceError(
      'FAL_SUBMIT_FAILED',
      `fal merge-videos submit failed (${response.status}): ${text.slice(0, 200)}`,
    )
  }

  return (await response.json()) as FalQueueSubmitResponse
}

interface ComposeKeyframe {
  timestamp: number
  duration: number
  url: string
}

function validateComposeInput(input: ComposeVideoServiceInput): void {
  if (input.clips.length < 2) {
    throw new MergeVideoServiceError(
      'TOO_FEW_CLIPS',
      'At least 2 video clips are required to compose.',
    )
  }
  if (input.clips.length > MAX_MERGE_CLIPS) {
    throw new MergeVideoServiceError(
      'TOO_MANY_CLIPS',
      `Up to ${MAX_MERGE_CLIPS} clips can be composed per request.`,
    )
  }
  for (const clip of input.clips) {
    try {
      new URL(clip.url)
    } catch {
      throw new MergeVideoServiceError(
        'INVALID_URL',
        `Invalid video URL: ${clip.url}`,
      )
    }
    if (
      typeof clip.startSec === 'number' &&
      typeof clip.endSec === 'number' &&
      clip.endSec <= clip.startSec
    ) {
      throw new MergeVideoServiceError(
        'INVALID_URL',
        `Clip ${clip.url}: endSec must be greater than startSec.`,
      )
    }
  }
}

/**
 * Build the compose-endpoint `tracks[0].keyframes` array from our trim
 * inputs. Each keyframe runs from `timestamp` (where it lives on the
 * output timeline) for `duration` ms.
 *
 * Today we lay out clips end-to-end without overlap. Each clip's
 * `duration` is derived from the user-supplied trim: (endSec - startSec)
 * if both are given, otherwise endSec - 0, otherwise naturalDurationSec
 * - startSec, otherwise the per-endpoint default (60s, picked to keep
 *  total under fal's 90s soft cap when nothing is known).
 *
 * fal compose has no source-offset field today — startSec > 0 is
 * logged but not enforced. When fal exposes a source offset we can keep
 * this signature and just thread it through.
 */
function buildComposeKeyframes(
  clips: readonly ComposeClipInput[],
): ComposeKeyframe[] {
  const fallbackDurationSec = 60
  let cursorMs = 0
  const keyframes: ComposeKeyframe[] = []

  for (const clip of clips) {
    const start = clip.startSec ?? 0
    const end =
      clip.endSec ??
      (typeof clip.naturalDurationSec === 'number'
        ? clip.naturalDurationSec
        : start + fallbackDurationSec)
    const durationSec = Math.max(0.1, end - start)
    const durationMs = Math.round(durationSec * 1000)

    keyframes.push({
      timestamp: cursorMs,
      duration: durationMs,
      url: clip.url,
    })
    cursorMs += durationMs
  }

  return keyframes
}

async function submitFalCompose(
  input: ComposeVideoServiceInput,
): Promise<FalQueueSubmitResponse> {
  const keyframes = buildComposeKeyframes(input.clips)
  const body: Record<string, unknown> = {
    tracks: [
      {
        id: 'video-merge-track',
        type: 'video',
        keyframes,
      },
    ],
  }

  const response = await fetch(`${FAL_QUEUE_BASE}/${FAL_COMPOSE_ENDPOINT}`, {
    method: 'POST',
    headers: {
      Authorization: `Key ${input.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new MergeVideoServiceError(
      'FAL_SUBMIT_FAILED',
      `fal compose submit failed (${response.status}): ${text.slice(0, 200)}`,
    )
  }

  return (await response.json()) as FalQueueSubmitResponse
}

async function pollFalMerge(
  queue: FalQueueSubmitResponse,
  apiKey: string,
): Promise<FalMergeResultBody> {
  for (let attempt = 1; attempt <= POLL_MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 1) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    }

    const statusRes = await fetch(queue.status_url, {
      headers: { Authorization: `Key ${apiKey}` },
    })
    if (!statusRes.ok) {
      throw new MergeVideoServiceError(
        'FAL_POLL_FAILED',
        `fal merge-videos status poll failed (${statusRes.status})`,
      )
    }
    const status = (await statusRes.json()) as FalQueueStatusResponse

    if (status.status === 'COMPLETED') {
      const resultRes = await fetch(queue.response_url, {
        headers: { Authorization: `Key ${apiKey}` },
      })
      if (!resultRes.ok) {
        throw new MergeVideoServiceError(
          'FAL_POLL_FAILED',
          `fal merge-videos result fetch failed (${resultRes.status})`,
        )
      }
      return (await resultRes.json()) as FalMergeResultBody
    }

    if (
      status.status === 'FAILED' ||
      status.status === 'CANCELLED' ||
      status.status === 'ERROR'
    ) {
      throw new MergeVideoServiceError(
        'FAL_SUBMIT_FAILED',
        `fal merge-videos reported ${status.status}`,
      )
    }
  }

  throw new MergeVideoServiceError(
    'FAL_TIMED_OUT',
    `fal merge-videos still pending after ${POLL_MAX_ATTEMPTS} polls`,
  )
}

/**
 * Stitch multiple upstream video clips into a single mp4 via the fal
 * ffmpeg merge-videos endpoint, then download the result to R2 and return
 * the public URL so downstream nodes (e.g. Seedance Reference) can use it
 * via the existing video_urls pipeline.
 *
 * MVP scope: no Cloudflare Workflow (fal completes in ~8s, far inside
 * Vercel function timeout), no progress streaming. Future iterations can
 * lift this into the execution worker if merge runtimes get longer.
 */
export async function mergeVideoClips(
  input: MergeVideoServiceInput,
): Promise<MergeVideoServiceResult> {
  validateInput(input)

  const queue = await withRetry(() => submitFalMerge(input), {
    maxAttempts: 2,
    baseDelayMs: 1_000,
    label: 'fal-merge-videos-submit',
  })

  const result = await pollFalMerge(queue, input.apiKey)

  const artifactUrl = result.video?.url
  if (!artifactUrl) {
    throw new MergeVideoServiceError(
      'FAL_NO_OUTPUT',
      'fal merge-videos completed without a video URL',
    )
  }

  // fal returns its CDN URL with a short TTL; mirror to our R2 bucket so
  // downstream consumers (Seedance Reference video_urls) keep working past
  // fal's expiry window.
  const downloaded = await fetchAsBuffer(artifactUrl)
  const random = randomBytes(12).toString('hex')
  const date = new Date().toISOString().slice(0, 10)
  const storageKey = `video-merges/${input.userId}/${date}_${random}.mp4`
  const mimeType = result.video?.content_type ?? 'video/mp4'

  const publicUrl = await uploadToR2({
    data: downloaded.buffer,
    key: storageKey,
    mimeType,
  })

  logger.info('Video merge succeeded', {
    requestId: queue.request_id,
    userId: input.userId,
    clipCount: input.videoUrls.length,
    sizeBytes: downloaded.buffer.byteLength,
    durationSeconds: result.metadata?.total_duration,
    width: result.metadata?.final_width,
    height: result.metadata?.final_height,
  })

  return {
    url: publicUrl,
    storageKey,
    sizeBytes: downloaded.buffer.byteLength,
    mimeType,
    width: result.metadata?.final_width,
    height: result.metadata?.final_height,
    durationSeconds: result.metadata?.total_duration,
    fps: result.metadata?.final_fps,
    requestId: queue.request_id,
  }
}

/**
 * Like {@link mergeVideoClips} but routes through fal's compose endpoint,
 * which accepts per-keyframe timestamp + duration. Used by the
 * videoMerge node when at least one upstream clip carries a trim
 * override; lets users tail-trim a long Seedance clip before stitching
 * it together with shorter shots.
 *
 * Note: fal compose has no source-offset parameter today, so startSec >
 * 0 is best-effort (logged but not enforced server-side). When fal ships
 * a source-offset field, the keyframe builder above is the only thing
 * that needs to change.
 */
export async function composeVideoClips(
  input: ComposeVideoServiceInput,
): Promise<MergeVideoServiceResult> {
  validateComposeInput(input)

  const queue = await withRetry(() => submitFalCompose(input), {
    maxAttempts: 2,
    baseDelayMs: 1_000,
    label: 'fal-compose-submit',
  })

  const result = await pollFalMerge(queue, input.apiKey)

  const artifactUrl = result.video?.url
  if (!artifactUrl) {
    throw new MergeVideoServiceError(
      'FAL_NO_OUTPUT',
      'fal compose completed without a video URL',
    )
  }

  const downloaded = await fetchAsBuffer(artifactUrl)
  const random = randomBytes(12).toString('hex')
  const date = new Date().toISOString().slice(0, 10)
  const storageKey = `video-merges/${input.userId}/${date}_${random}.mp4`
  const mimeType = result.video?.content_type ?? 'video/mp4'

  const publicUrl = await uploadToR2({
    data: downloaded.buffer,
    key: storageKey,
    mimeType,
  })

  const totalRequestedDurationSec = input.clips.reduce((acc, clip) => {
    if (typeof clip.endSec === 'number') {
      const start = clip.startSec ?? 0
      return acc + Math.max(0.1, clip.endSec - start)
    }
    return acc
  }, 0)
  const startSecOverrides = input.clips.filter(
    (c) => typeof c.startSec === 'number' && c.startSec > 0,
  ).length

  logger.info('Video compose succeeded', {
    requestId: queue.request_id,
    userId: input.userId,
    clipCount: input.clips.length,
    sizeBytes: downloaded.buffer.byteLength,
    durationSeconds: result.metadata?.total_duration,
    requestedDurationSeconds: totalRequestedDurationSec || undefined,
    width: result.metadata?.final_width,
    height: result.metadata?.final_height,
    startSecOverrides: startSecOverrides > 0 ? startSecOverrides : undefined,
  })

  return {
    url: publicUrl,
    storageKey,
    sizeBytes: downloaded.buffer.byteLength,
    mimeType,
    width: result.metadata?.final_width,
    height: result.metadata?.final_height,
    durationSeconds: result.metadata?.total_duration,
    fps: result.metadata?.final_fps,
    requestId: queue.request_id,
  }
}

export const MERGE_VIDEO_LIMITS = {
  MIN_CLIPS: 2,
  MAX_CLIPS: MAX_MERGE_CLIPS,
} as const
