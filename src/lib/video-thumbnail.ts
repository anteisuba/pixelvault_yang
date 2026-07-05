/**
 * Capture a poster frame from a user-selected video File in the browser.
 *
 * Manually-uploaded reference videos (the `videoReference` node) never get a
 * `Generation.thumbnailUrl` — the service deliberately writes bytes without a
 * Generation row (see `video-reference.service.ts`). So we grab a frame
 * client-side and upload it alongside the video, giving the node/token the same
 * poster the AI-generated path gets for free (§9.2 of the v4 detail spec).
 *
 * Best-effort: any decode/seek/encode failure resolves to `null` — the caller
 * uploads the video without a poster rather than blocking on the thumbnail.
 */

/** Seek target: a hair past the start (avoids a black leader frame) but never
 *  past the midpoint of a very short clip. */
function pickSeekTime(duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0
  return Math.min(0.1, duration / 2)
}

export async function captureVideoThumbnail(file: File): Promise<Blob | null> {
  if (typeof document === 'undefined') return null

  return new Promise<Blob | null>((resolve) => {
    const video = document.createElement('video')
    const objectUrl = URL.createObjectURL(file)
    let settled = false

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl)
      video.removeAttribute('src')
      video.load()
      video.remove()
    }
    const finish = (result: Blob | null) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(result)
    }

    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true

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

    video.onerror = () => finish(null)

    video.src = objectUrl
  })
}
