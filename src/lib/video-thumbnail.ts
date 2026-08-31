/**
 * Capture a poster frame from a user-selected video File in the browser.
 *
 * Manually-uploaded reference videos (the `videoReference` node) never get a
 * `Generation.thumbnailUrl` — the service deliberately writes bytes without a
 * Generation row (see `video-reference.service.ts`). So we grab a frame
 * client-side and upload it alongside the video, giving the node/token the same
 * poster the AI-generated path gets for free (§9.2 of the v4 detail spec).
 *
 * Best-effort: any decode/seek/encode failure — or a probe the browser never
 * answers at all — resolves to `null`; the caller uploads the video without a
 * poster rather than blocking on the thumbnail.
 */

import { MEDIA_PROBE_TIMEOUT_MS } from '@/constants/media-probe'

/** Seek target: a hair past the start (avoids a black leader frame) but never
 *  past the midpoint of a very short clip. */
function pickSeekTime(duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0
  return Math.min(0.1, duration / 2)
}

export interface VideoFileMetadata {
  width: number
  height: number
  duration?: number
}

/**
 * Run a best-effort probe against a throwaway `<video>` holding `file`.
 *
 * Both probes below go through here so the object URL, the element teardown and
 * the time budget have exactly one implementation. The budget in particular has
 * to live *inside* the promise: a hidden tab dispatches none of the events these
 * probes wait on (see `MEDIA_PROBE_TIMEOUT_MS`), and racing a timer on the
 * outside would free the caller while leaking this element and its object URL.
 *
 * `attach` installs the stage handlers and calls `finish` exactly once with the
 * result; `error` and the budget are already wired.
 */
function probeVideoFile<T>(
  file: File,
  attach: (video: HTMLVideoElement, finish: (result: T | null) => void) => void,
): Promise<T | null> {
  return new Promise<T | null>((resolve) => {
    const video = document.createElement('video')
    const objectUrl = URL.createObjectURL(file)
    let settled = false

    const finish = (result: T | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      URL.revokeObjectURL(objectUrl)
      video.removeAttribute('src')
      video.load()
      video.remove()
      resolve(result)
    }

    // Declared after `finish` because they close over each other; nothing can
    // call `finish` before this line runs, so the reference is always live.
    const timer = setTimeout(() => finish(null), MEDIA_PROBE_TIMEOUT_MS)

    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    video.onerror = () => finish(null)

    attach(video, finish)

    video.src = objectUrl
  })
}

/** Read browser-decoded video dimensions/duration without uploading bytes. */
export async function readVideoFileMetadata(
  file: File,
): Promise<VideoFileMetadata | null> {
  if (typeof document === 'undefined') return null

  return probeVideoFile<VideoFileMetadata>(file, (video, finish) => {
    video.onloadedmetadata = () => {
      const width = video.videoWidth
      const height = video.videoHeight
      if (!width || !height) {
        finish(null)
        return
      }
      finish({
        width,
        height,
        duration:
          Number.isFinite(video.duration) && video.duration >= 0
            ? video.duration
            : undefined,
      })
    }
  })
}

export async function captureVideoThumbnail(file: File): Promise<Blob | null> {
  if (typeof document === 'undefined') return null

  return probeVideoFile<Blob>(file, (video, finish) => {
    video.onloadedmetadata = () => {
      // Seeking triggers the frame we actually draw — set the target and wait
      // for `seeked` rather than drawing off the metadata frame (often blank).
      video.currentTime = pickSeekTime(video.duration)
    }

    video.onseeked = () => {
      try {
        const width = video.videoWidth
        const height = video.videoHeight
        if (!width || !height) {
          finish(null)
          return
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          finish(null)
          return
        }
        ctx.drawImage(video, 0, 0, width, height)
        canvas.toBlob((blob) => finish(blob), 'image/webp', 0.8)
      } catch {
        finish(null)
      }
    }
  })
}
