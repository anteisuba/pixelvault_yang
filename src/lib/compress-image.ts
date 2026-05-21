/**
 * Client-side image compression so users hit "upload" / paste once and the
 * file is silently shrunk under the server's size cap instead of bouncing
 * with "File too large".
 *
 * Strategy:
 *   - File already under the cap → return as-is (no work, no quality loss).
 *   - GIF → refuse: canvas reencoding would flatten the animation to one frame.
 *     Caller surfaces a "compress externally first" error.
 *   - PNG → keep PNG (preserves alpha), only resize down — toBlob quality is
 *     ignored for PNG anyway.
 *   - Anything else (JPEG / WEBP) → reencode as JPEG, drop quality first
 *     (0.92 → 0.6 in 0.1 steps), then start scaling 80% per step.
 *
 * Falls back to throwing `ImageCompressionError` after 8 attempts so the
 * caller can show a meaningful "couldn't fit" message instead of silently
 * sending an oversized blob.
 */

'use client'

export interface CompressImageOptions {
  /** Maximum allowed output size in bytes. Returned file is guaranteed ≤ this. */
  maxBytes: number
  /** Longest-edge cap applied on first attempt (default: 4096). */
  maxDimension?: number
  /** JPEG/WEBP quality floor before we start scaling down (default: 0.6). */
  minQuality?: number
}

export interface CompressImageResult {
  file: File
  originalBytes: number
  compressedBytes: number
  /** False when the input already fit; true after any reencode/resize. */
  wasCompressed: boolean
}

export type CompressImageErrorCode =
  | 'UNSUPPORTED_FORMAT'
  | 'DECODE_FAILED'
  | 'CANNOT_COMPRESS_ENOUGH'

export class ImageCompressionError extends Error {
  constructor(
    public readonly code: CompressImageErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'ImageCompressionError'
  }
}

const DEFAULT_MAX_DIMENSION = 4096
const DEFAULT_MIN_QUALITY = 0.6
const MAX_ATTEMPTS = 8
const SCALE_STEP = 0.8
const QUALITY_STEP = 0.1
const INITIAL_QUALITY = 0.92

export async function compressImageToLimit(
  file: File,
  options: CompressImageOptions,
): Promise<CompressImageResult> {
  const {
    maxBytes,
    maxDimension = DEFAULT_MAX_DIMENSION,
    minQuality = DEFAULT_MIN_QUALITY,
  } = options
  const originalBytes = file.size

  if (originalBytes <= maxBytes) {
    return {
      file,
      originalBytes,
      compressedBytes: originalBytes,
      wasCompressed: false,
    }
  }

  // Animated GIFs collapse to a single frame after canvas reencode — refuse
  // so the caller can tell the user to compress externally first.
  if (file.type === 'image/gif') {
    throw new ImageCompressionError(
      'UNSUPPORTED_FORMAT',
      'GIF files cannot be auto-compressed without losing animation.',
    )
  }

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch (err) {
    throw new ImageCompressionError(
      'DECODE_FAILED',
      err instanceof Error ? err.message : 'Failed to decode image',
    )
  }

  try {
    // PNG keeps format to preserve alpha; WEBP/JPEG/etc reencode as JPEG
    // because that gets the best size win for photographic content.
    const isPng = file.type === 'image/png'
    const outputType: 'image/png' | 'image/jpeg' = isPng
      ? 'image/png'
      : 'image/jpeg'

    let quality = isPng ? undefined : INITIAL_QUALITY
    let scale = 1

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const dims = computeTargetDimensions(
        bitmap.width,
        bitmap.height,
        scale,
        maxDimension,
      )

      const blob = await drawToBlob(bitmap, dims, outputType, quality)

      if (blob.size <= maxBytes) {
        const ext = outputType === 'image/png' ? '.png' : '.jpg'
        const baseName = file.name.replace(/\.[^.]+$/, '') || 'image'
        const output = new File([blob], `${baseName}${ext}`, {
          type: outputType,
          lastModified: file.lastModified,
        })
        return {
          file: output,
          originalBytes,
          compressedBytes: output.size,
          wasCompressed: true,
        }
      }

      // Cascade: drop JPEG quality first (cheap visual cost), then start
      // shrinking dimensions once we hit the quality floor.
      if (
        !isPng &&
        quality !== undefined &&
        quality > minQuality + Number.EPSILON
      ) {
        quality = Math.max(minQuality, quality - QUALITY_STEP)
      } else {
        scale *= SCALE_STEP
      }
    }

    throw new ImageCompressionError(
      'CANNOT_COMPRESS_ENOUGH',
      `Could not compress image below ${maxBytes} bytes after ${MAX_ATTEMPTS} attempts.`,
    )
  } finally {
    bitmap.close?.()
  }
}

interface TargetDimensions {
  width: number
  height: number
}

function computeTargetDimensions(
  sourceWidth: number,
  sourceHeight: number,
  scale: number,
  maxDimension: number,
): TargetDimensions {
  let width = Math.max(1, Math.round(sourceWidth * scale))
  let height = Math.max(1, Math.round(sourceHeight * scale))

  if (width <= maxDimension && height <= maxDimension) {
    return { width, height }
  }

  // Maintain aspect ratio while clamping the longest edge.
  if (width >= height) {
    height = Math.max(1, Math.round((maxDimension * height) / width))
    width = maxDimension
  } else {
    width = Math.max(1, Math.round((maxDimension * width) / height))
    height = maxDimension
  }
  return { width, height }
}

async function drawToBlob(
  bitmap: ImageBitmap,
  dims: TargetDimensions,
  type: 'image/png' | 'image/jpeg',
  quality: number | undefined,
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = dims.width
  canvas.height = dims.height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new ImageCompressionError(
      'DECODE_FAILED',
      '2D canvas context unavailable',
    )
  }
  ctx.drawImage(bitmap, 0, 0, dims.width, dims.height)

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else
          reject(
            new ImageCompressionError(
              'DECODE_FAILED',
              'canvas.toBlob returned null',
            ),
          )
      },
      type,
      quality,
    )
  })
}
