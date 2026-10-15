/**
 * Validate a video container from its bytes instead of trusting a MIME the
 * browser (or a remote server) claimed. MP4/QuickTime are ISO-BMFF (`ftyp`
 * box); WebM is EBML with a `webm` DocType near the start of the header.
 *
 * Pure and dependency-free so both the upload path and the assistant's
 * clip-watching path (`assistant-v3-watch.service.ts`) check the same way.
 */
export function detectTrustedVideoMime(buffer: Buffer): string {
  if (buffer.byteLength < 12) {
    throw new Error('Invalid or empty video file')
  }

  if (buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
    return buffer.subarray(8, 12).toString('ascii') === 'qt  '
      ? 'video/quicktime'
      : 'video/mp4'
  }

  const hasEbmlHeader =
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3
  const headerText = buffer
    .subarray(0, Math.min(buffer.length, 4096))
    .toString()
  if (hasEbmlHeader && headerText.toLowerCase().includes('webm')) {
    return 'video/webm'
  }

  throw new Error('Unsupported or invalid video file')
}
