/**
 * Read a user-selected audio File's duration in the browser, without uploading
 * any bytes.
 *
 * Best-effort: a decode failure — or a probe the browser never answers at all —
 * resolves to `null`; the caller uploads the audio without a duration rather
 * than blocking on the probe.
 */

import { MEDIA_PROBE_TIMEOUT_MS } from '@/constants/media-probe'

export interface AudioFileMetadata {
  duration?: number
}

/** Read browser-decoded audio duration without uploading any bytes. */
export async function readAudioFileMetadata(
  file: File,
): Promise<AudioFileMetadata | null> {
  if (typeof document === 'undefined') return null

  return new Promise<AudioFileMetadata | null>((resolve) => {
    const audio = document.createElement('audio')
    const objectUrl = URL.createObjectURL(file)
    let settled = false

    const finish = (result: AudioFileMetadata | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      URL.revokeObjectURL(objectUrl)
      audio.removeAttribute('src')
      audio.load()
      audio.remove()
      resolve(result)
    }

    // The budget has to live *inside* the promise: a hidden tab dispatches
    // neither `loadedmetadata` nor `error` (see `MEDIA_PROBE_TIMEOUT_MS`), and
    // racing a timer on the outside would free the caller while leaking this
    // element and its object URL.
    // Declared after `finish` because they close over each other; nothing can
    // call `finish` before this line runs, so the reference is always live.
    const timer = setTimeout(() => finish(null), MEDIA_PROBE_TIMEOUT_MS)

    audio.preload = 'metadata'
    audio.onloadedmetadata = () => {
      finish({
        duration:
          Number.isFinite(audio.duration) && audio.duration >= 0
            ? audio.duration
            : undefined,
      })
    }
    audio.onerror = () => finish(null)
    audio.src = objectUrl
  })
}
