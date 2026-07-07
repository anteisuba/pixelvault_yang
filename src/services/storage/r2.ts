import 'server-only'

import { randomBytes } from 'node:crypto'
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import sharp from 'sharp'
import { logger } from '@/lib/logger'
import { withRetry } from '@/lib/with-retry'
import { assertSafeUrl, safeFetch } from '@/lib/url-guard'

// ─── R2 Client ────────────────────────────────────────────────────

const r2 = new S3Client({
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  region: 'auto',
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

// ─── Storage Key ──────────────────────────────────────────────────

/**
 * Generate a unique R2 storage key for a given output type, scoped to the user.
 * Format: generations/{userId}/image/YYYY-MM-DD_<24-char random>.png
 */
export function generateStorageKey(
  outputType: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'MODEL_3D',
  userId: string,
  audioFormat?: string,
): string {
  const date = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  const random = randomBytes(12).toString('hex') // 24-char cryptographically secure

  if (outputType === 'AUDIO') {
    const ext =
      audioFormat === 'wav' ? 'wav' : audioFormat === 'opus' ? 'opus' : 'mp3'
    return `generations/${userId}/audio/${date}_${random}.${ext}`
  }

  if (outputType === 'MODEL_3D') {
    return `generations/${userId}/model_3d/${date}_${random}.glb`
  }

  const subdir = outputType === 'VIDEO' ? 'video' : 'image'
  const ext = outputType === 'VIDEO' ? 'mp4' : 'png'
  return `generations/${userId}/${subdir}/${date}_${random}.${ext}`
}

// ─── Magic-Byte Image Validation ──────────────────────────────────

const SHARP_FORMAT_TO_MIME: Record<string, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
}

/**
 * Verify the *real* format of an image buffer via libvips magic bytes and
 * return a trusted MIME type. Use this on every code path that accepts an
 * image from a client — `fetchAsBuffer` only reads the claimed MIME from a
 * data URL header or HTTP `content-type`, both of which the user controls.
 *
 * Throws when the buffer is not a decodable raster image in the allowed
 * set. Defaults to `{ jpeg, png, webp, gif }` — SVG is intentionally
 * excluded because it can carry inline scripts.
 */
export async function detectTrustedImageMime(
  buffer: Buffer,
  allowedFormats: ReadonlySet<string> = new Set(['jpeg', 'png', 'webp', 'gif']),
): Promise<{
  format: string
  mimeType: string
  width: number
  height: number
}> {
  let format: string | undefined
  let width: number | undefined
  let height: number | undefined
  try {
    const metadata = await sharp(buffer).metadata()
    format = metadata.format
    width = metadata.width
    height = metadata.height
  } catch {
    throw new Error('Unsupported or corrupted image file')
  }
  if (!format || !allowedFormats.has(format)) {
    throw new Error(
      `Unsupported image format: ${format ?? 'unknown'}. Allowed: ${[...allowedFormats].join(', ')}`,
    )
  }
  return {
    format,
    mimeType: SHARP_FORMAT_TO_MIME[format] ?? `image/${format}`,
    width: width ?? 0,
    height: height ?? 0,
  }
}

// ─── Fetch as Buffer ──────────────────────────────────────────────

export interface FetchAsBufferOptions {
  headers?: Record<string, string>
  /**
   * Hard cap on the resolved buffer size, in bytes. Applied for both
   * `data:` URLs (counted before decode-bound expansion) and remote
   * URLs (checked against `Content-Length`, then against the actual
   * downloaded size). Throws when exceeded so callers don't have to
   * defensively re-validate.
   *
   * Use this on any path where the URL comes from end-user input —
   * provider-controlled URLs (e.g. fal.ai output) can leave it unset.
   */
  maxBytes?: number
}

const DATA_URL_PREFIX = 'data:'
const DATA_URL_BASE64_MARKER = 'base64'

function isFetchAsBufferOptions(
  value: Record<string, string> | FetchAsBufferOptions,
): value is FetchAsBufferOptions {
  return 'headers' in value || 'maxBytes' in value
}

function parseBase64DataUrl(url: string): {
  mimeType: string
  base64Data: string
} {
  const commaIndex = url.indexOf(',')
  if (commaIndex <= DATA_URL_PREFIX.length) throw new Error('Invalid data URL')

  const metadata = url.slice(DATA_URL_PREFIX.length, commaIndex)
  const base64Data = url.slice(commaIndex + 1)
  const metadataParts = metadata.split(';')
  const mimeType = metadataParts[0]
  const isBase64 = metadataParts
    .slice(1)
    .some((part) => part.toLowerCase() === DATA_URL_BASE64_MARKER)

  if (!mimeType || !isBase64 || !base64Data) {
    throw new Error('Invalid data URL')
  }

  return { mimeType, base64Data }
}

/**
 * Normalize an image URL to a Buffer + mimeType pair.
 * Handles both base64 data URLs and plain http(s) URLs.
 *
 * Accepts the legacy `headers` shorthand for backward compatibility, or
 * the richer options object including `maxBytes`.
 */
export async function fetchAsBuffer(
  url: string,
  headersOrOptions?: Record<string, string> | FetchAsBufferOptions,
): Promise<{ buffer: Buffer; mimeType: string }> {
  const options: FetchAsBufferOptions =
    headersOrOptions && isFetchAsBufferOptions(headersOrOptions)
      ? headersOrOptions
      : headersOrOptions
        ? { headers: headersOrOptions }
        : {}
  const { headers, maxBytes } = options

  if (maxBytes !== undefined && (!Number.isFinite(maxBytes) || maxBytes < 0)) {
    throw new Error('Invalid maxBytes option.')
  }

  if (url.startsWith(DATA_URL_PREFIX)) {
    const { mimeType, base64Data } = parseBase64DataUrl(url)
    const buffer = Buffer.from(base64Data, 'base64')
    if (maxBytes !== undefined && buffer.byteLength > maxBytes) {
      throw new Error(
        `Image exceeds maximum size of ${maxBytes} bytes (got ${buffer.byteLength}).`,
      )
    }
    return { buffer, mimeType }
  }

  const response = await safeFetch(url, {
    allowedProtocols: ['http:', 'https:'],
    ...(headers && { headers }),
  })
  if (!response.ok) {
    throw new Error(`Failed to fetch image (${response.status}): ${url}`)
  }

  if (maxBytes !== undefined) {
    const declared = Number.parseInt(
      response.headers.get('content-length') ?? '',
      10,
    )
    if (Number.isFinite(declared) && declared > maxBytes) {
      throw new Error(
        `Image exceeds maximum size of ${maxBytes} bytes (declared ${declared}).`,
      )
    }
  }

  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  if (maxBytes !== undefined && buffer.byteLength > maxBytes) {
    throw new Error(
      `Image exceeds maximum size of ${maxBytes} bytes (got ${buffer.byteLength}).`,
    )
  }
  const mimeType = response.headers.get('content-type') ?? 'image/png'

  return { buffer, mimeType }
}

// ─── Upload to R2 ─────────────────────────────────────────────────

/**
 * Upload a Buffer to Cloudflare R2 and return the public URL.
 */
export async function uploadToR2(params: {
  data: Buffer
  key: string
  mimeType: string
}): Promise<string> {
  await withRetry(
    () =>
      r2.send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME!,
          Key: params.key,
          Body: params.data,
          ContentType: params.mimeType,
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      ),
    { maxAttempts: 3, baseDelayMs: 500, label: 'r2.upload' },
  )

  logger.info('Uploaded to R2', { key: params.key, mimeType: params.mimeType })
  return `${process.env.NEXT_PUBLIC_STORAGE_BASE_URL}/${params.key}`
}

// ─── Image Preview Derivatives ──────────────────────────────────

const IMAGE_PREVIEW_VARIANTS = {
  thumbnail: { maxSize: 384, quality: 78 },
  preview: { maxSize: 1280, quality: 82 },
} as const

type ImagePreviewVariant = keyof typeof IMAGE_PREVIEW_VARIANTS

export interface ImagePreviewAssets {
  thumbnailUrl: string
  thumbnailStorageKey: string
  previewUrl: string
  previewStorageKey: string
}

function buildImageDerivativeStorageKey(
  sourceKey: string,
  variant: ImagePreviewVariant,
): string {
  return buildDerivativeStorageKey(sourceKey, variant)
}

function buildDerivativeStorageKey(sourceKey: string, suffix: string): string {
  const slashIndex = sourceKey.lastIndexOf('/')
  const directory = slashIndex >= 0 ? sourceKey.slice(0, slashIndex + 1) : ''
  const filename = slashIndex >= 0 ? sourceKey.slice(slashIndex + 1) : sourceKey
  const basename = filename.replace(/\.[^.]+$/, '') || filename
  return `${directory}${basename}.${suffix}.webp`
}

async function createImageDerivativeBuffer(
  sourceBuffer: Buffer,
  variant: ImagePreviewVariant,
): Promise<Buffer> {
  const spec = IMAGE_PREVIEW_VARIANTS[variant]
  return sharp(sourceBuffer, { animated: false })
    .rotate()
    .resize({
      width: spec.maxSize,
      height: spec.maxSize,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: spec.quality, effort: 4 })
    .toBuffer()
}

/**
 * Thumbnail-only derivative for user uploads. Unlike generated images (which
 * keep both a 1280px preview and a 384px thumbnail), a stored upload serves
 * its full original in the detail view, so only the grid-tile thumbnail is
 * worth deriving — it keeps a dense asset grid of hundreds of high-res
 * originals from downloading multi-MB files per tile.
 */
export async function createImageThumbnailAsset(params: {
  sourceBuffer: Buffer
  sourceStorageKey: string
}): Promise<{ thumbnailUrl: string; thumbnailStorageKey: string }> {
  const thumbnailStorageKey = buildImageDerivativeStorageKey(
    params.sourceStorageKey,
    'thumbnail',
  )
  const thumbnailBuffer = await createImageDerivativeBuffer(
    params.sourceBuffer,
    'thumbnail',
  )
  const thumbnailUrl = await uploadToR2({
    data: thumbnailBuffer,
    key: thumbnailStorageKey,
    mimeType: 'image/webp',
  })
  return { thumbnailUrl, thumbnailStorageKey }
}

export async function createImagePreviewAssets(params: {
  sourceBuffer: Buffer
  sourceStorageKey: string
}): Promise<ImagePreviewAssets> {
  const thumbnailStorageKey = buildImageDerivativeStorageKey(
    params.sourceStorageKey,
    'thumbnail',
  )
  const previewStorageKey = buildImageDerivativeStorageKey(
    params.sourceStorageKey,
    'preview',
  )

  const [thumbnailBuffer, previewBuffer] = await Promise.all([
    createImageDerivativeBuffer(params.sourceBuffer, 'thumbnail'),
    createImageDerivativeBuffer(params.sourceBuffer, 'preview'),
  ])

  const [thumbnailUrl, previewUrl] = await Promise.all([
    uploadToR2({
      data: thumbnailBuffer,
      key: thumbnailStorageKey,
      mimeType: 'image/webp',
    }),
    uploadToR2({
      data: previewBuffer,
      key: previewStorageKey,
      mimeType: 'image/webp',
    }),
  ])

  return {
    thumbnailUrl,
    thumbnailStorageKey,
    previewUrl,
    previewStorageKey,
  }
}

// ─── Video Poster Derivative ────────────────────────────────────

const VIDEO_POSTER_MAX_SOURCE_BYTES = 12 * 1024 * 1024
const VIDEO_POSTER_MAX_SIZE = 768
const VIDEO_POSTER_QUALITY = 80

export interface VideoPosterAsset {
  thumbnailUrl: string
  thumbnailStorageKey: string
}

export async function createVideoPosterAsset(params: {
  sourceUrl: string
  sourceStorageKey: string
  fetchHeaders?: Record<string, string>
}): Promise<VideoPosterAsset> {
  const posterStorageKey = buildDerivativeStorageKey(
    params.sourceStorageKey,
    'thumbnail',
  )
  const source = await fetchAsBuffer(params.sourceUrl, {
    headers: params.fetchHeaders,
    maxBytes: VIDEO_POSTER_MAX_SOURCE_BYTES,
  })
  const posterBuffer = await sharp(source.buffer, { animated: false })
    .rotate()
    .resize({
      width: VIDEO_POSTER_MAX_SIZE,
      height: VIDEO_POSTER_MAX_SIZE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: VIDEO_POSTER_QUALITY, effort: 4 })
    .toBuffer()
  const thumbnailUrl = await uploadToR2({
    data: posterBuffer,
    key: posterStorageKey,
    mimeType: 'image/webp',
  })

  return {
    thumbnailUrl,
    thumbnailStorageKey: posterStorageKey,
  }
}

// ─── Same-Origin Storage URL Detection ────────────────────────────

/**
 * Hostnames whose objects already live in our R2 bucket. Used to short-circuit
 * re-uploads when a provider's reference image is already a URL we own — we
 * can reuse it directly instead of fetching + re-uploading to a fresh key.
 */
function ownedStorageHostnames(): Set<string> {
  const hosts = new Set<string>()
  const base = process.env.NEXT_PUBLIC_STORAGE_BASE_URL
  if (base) {
    try {
      hosts.add(new URL(base).hostname.toLowerCase())
    } catch {
      // ignore malformed env
    }
  }
  // Legacy r2.dev domain — existing rows in DB still reference this and it is
  // still our bucket, just a different public CDN host.
  hosts.add('pub-5346558f8dc549f9ba5217489fe5395e.r2.dev')
  return hosts
}

export function isOwnedStorageUrl(url: string): boolean {
  if (!url || url.startsWith('data:')) return false
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  return ownedStorageHostnames().has(parsed.hostname.toLowerCase())
}

// ─── Stream Upload to R2 (for large files like video) ────────────

/**
 * Stream-upload a remote URL directly to R2 using multipart upload.
 * Avoids loading the entire file into memory (prevents OOM for large videos).
 *
 * The `onProgress` callback (when provided) fires repeatedly during upload,
 * approximately once per `partSize` chunk completed. The `total` value is
 * taken from the source response's `content-length` header when present and
 * may be 0 if the provider doesn't advertise it.
 *
 * `concurrency` controls how many multipart parts are in flight at once. The
 * default of 1 preserves the previous (conservative) behaviour the video
 * pipeline was tuned against. Callers shipping large files where bandwidth
 * is the bottleneck (e.g. 100MB+ GLBs from fal) should pass 4+.
 */
export async function streamUploadToR2(params: {
  sourceUrl: string
  key: string
  mimeType: string
  fetchHeaders?: Record<string, string>
  onProgress?: (loaded: number, total: number) => void
  concurrency?: number
  partSizeBytes?: number
}): Promise<{ publicUrl: string; sizeBytes: number }> {
  assertSafeUrl(params.sourceUrl, { allowedProtocols: ['http:', 'https:'] })

  // Wrap entire fetch+upload in retry — stream can't be partially retried,
  // so we retry the full operation on transient failures
  return withRetry(
    async () => {
      const response = await safeFetch(params.sourceUrl, {
        allowedProtocols: ['http:', 'https:'],
        headers: params.fetchHeaders,
      })
      if (!response.ok || !response.body) {
        throw new Error(
          `Failed to fetch video for upload (${response.status}): ${params.sourceUrl}`,
        )
      }

      const contentLength = response.headers.get('content-length')
      const totalHint = contentLength ? Number.parseInt(contentLength, 10) : 0

      const upload = new Upload({
        client: r2,
        params: {
          Bucket: process.env.R2_BUCKET_NAME!,
          Key: params.key,
          Body: response.body as ReadableStream,
          ContentType: params.mimeType,
          CacheControl: 'public, max-age=31536000, immutable',
        },
        queueSize: params.concurrency ?? 1,
        partSize: params.partSizeBytes ?? 5 * 1024 * 1024,
      })

      if (params.onProgress) {
        const onProgress = params.onProgress
        upload.on('httpUploadProgress', (progress) => {
          const loaded = progress.loaded ?? 0
          const total = progress.total ?? totalHint
          onProgress(loaded, total)
        })
      }

      await upload.done()

      logger.info('Stream uploaded to R2', {
        key: params.key,
        sizeBytes: totalHint,
        mimeType: params.mimeType,
      })

      return {
        publicUrl: `${process.env.NEXT_PUBLIC_STORAGE_BASE_URL}/${params.key}`,
        sizeBytes: totalHint,
      }
    },
    { maxAttempts: 2, baseDelayMs: 2000, label: 'r2.streamUpload' },
  )
}

// ─── Fetch + Stream Upload (provider HTTP URL → R2) ──────────────

/**
 * Fetch a remote HTTP image and stream it straight into R2.
 *
 * Compared to `fetchAsBuffer` + `uploadToR2`, this pipelines the download and
 * upload (no full-image buffer sits in lambda memory between the two), and
 * returns the response's `content-type` so callers don't need to read headers
 * separately. For the image generation hot path on URL-returning providers
 * (fal / replicate / HuggingFace) this saves the cost of materialising the
 * payload in memory twice.
 *
 * Do NOT use this for `data:` URLs — base64 payloads must go through
 * `fetchAsBuffer` + `uploadToR2`.
 */
export async function uploadFromHttpToR2(params: {
  sourceUrl: string
  key: string
  fetchHeaders?: Record<string, string>
}): Promise<{ publicUrl: string; mimeType: string }> {
  assertSafeUrl(params.sourceUrl, { allowedProtocols: ['http:', 'https:'] })

  return withRetry(
    async () => {
      const response = await safeFetch(params.sourceUrl, {
        allowedProtocols: ['http:', 'https:'],
        headers: params.fetchHeaders,
      })
      if (!response.ok || !response.body) {
        throw new Error(
          `Failed to fetch image (${response.status}): ${params.sourceUrl}`,
        )
      }

      const mimeType = response.headers.get('content-type') ?? 'image/png'

      const upload = new Upload({
        client: r2,
        params: {
          Bucket: process.env.R2_BUCKET_NAME!,
          Key: params.key,
          Body: response.body as ReadableStream,
          ContentType: mimeType,
          CacheControl: 'public, max-age=31536000, immutable',
        },
        queueSize: 1,
        partSize: 5 * 1024 * 1024,
      })

      await upload.done()

      logger.info('Uploaded HTTP source to R2', {
        key: params.key,
        mimeType,
      })

      return {
        publicUrl: `${process.env.NEXT_PUBLIC_STORAGE_BASE_URL}/${params.key}`,
        mimeType,
      }
    },
    { maxAttempts: 2, baseDelayMs: 1000, label: 'r2.uploadFromHttp' },
  )
}

// ─── Buffered HTTP Upload (for provider files that stall under streaming) ──

/**
 * Fetch a remote HTTP file into a Buffer, then upload it to R2.
 *
 * This is intentionally used for medium-sized 3D model files. Some provider
 * CDNs terminate long-lived streamed downloads while R2 multipart upload is
 * applying backpressure; buffering decouples provider download from R2 upload.
 */
export async function uploadBufferedHttpToR2(params: {
  sourceUrl: string
  key: string
  mimeType?: string
  fetchHeaders?: Record<string, string>
  timeoutMs?: number
}): Promise<{ publicUrl: string; mimeType: string; sizeBytes: number }> {
  assertSafeUrl(params.sourceUrl)

  return withRetry(
    async () => {
      const response = await safeFetch(params.sourceUrl, {
        headers: params.fetchHeaders,
        signal: AbortSignal.timeout(params.timeoutMs ?? 180_000),
      })
      if (!response.ok) {
        throw new Error(
          `Failed to fetch file for buffered upload (${response.status}): ${params.sourceUrl}`,
        )
      }

      const arrayBuffer = await response.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      const mimeType =
        params.mimeType ??
        response.headers.get('content-type') ??
        'application/octet-stream'

      await r2.send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME!,
          Key: params.key,
          Body: buffer,
          ContentType: mimeType,
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      )

      logger.info('Buffered HTTP source uploaded to R2', {
        key: params.key,
        sizeBytes: buffer.byteLength,
        mimeType,
      })

      return {
        publicUrl: `${process.env.NEXT_PUBLIC_STORAGE_BASE_URL}/${params.key}`,
        mimeType,
        sizeBytes: buffer.byteLength,
      }
    },
    { maxAttempts: 3, baseDelayMs: 2000, label: 'r2.uploadBufferedHttp' },
  )
}

// ─── Delete from R2 ──────────────────────────────────────────────

/**
 * Delete an object from Cloudflare R2 by its storage key.
 */
export async function deleteFromR2(key: string): Promise<void> {
  await r2.send(
    new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: key,
    }),
  )
}

export async function deleteManyFromR2(keys: string[]): Promise<void> {
  const uniqueKeys = Array.from(
    new Set(keys.map((key) => key.trim()).filter(Boolean)),
  )
  if (uniqueKeys.length === 0) return

  const results = await Promise.allSettled(
    uniqueKeys.map((key) => deleteFromR2(key)),
  )

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      logger.error('R2 cleanup failed', {
        key: uniqueKeys[index],
        error:
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason),
      })
    }
  })
}
