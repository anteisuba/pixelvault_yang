import 'server-only'

import { randomBytes } from 'node:crypto'
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { logger } from '@/lib/logger'
import { withRetry } from '@/lib/with-retry'
import { assertSafeUrl } from '@/lib/url-guard'

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

// ─── Fetch as Buffer ──────────────────────────────────────────────

/**
 * Normalize an image URL to a Buffer + mimeType pair.
 * Handles both base64 data URLs and plain https URLs.
 */
export async function fetchAsBuffer(
  url: string,
  headers?: Record<string, string>,
): Promise<{ buffer: Buffer; mimeType: string }> {
  if (url.startsWith('data:')) {
    const [meta, base64] = url.split(',')
    const mimeType = meta.split(':')[1].split(';')[0]
    const buffer = Buffer.from(base64, 'base64')
    return { buffer, mimeType }
  }

  assertSafeUrl(url)
  const response = await fetch(url, headers ? { headers } : undefined)
  if (!response.ok) {
    throw new Error(`Failed to fetch image (${response.status}): ${url}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
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
 */
export async function streamUploadToR2(params: {
  sourceUrl: string
  key: string
  mimeType: string
  fetchHeaders?: Record<string, string>
}): Promise<{ publicUrl: string; sizeBytes: number }> {
  // Wrap entire fetch+upload in retry — stream can't be partially retried,
  // so we retry the full operation on transient failures
  return withRetry(
    async () => {
      const response = await fetch(params.sourceUrl, {
        headers: params.fetchHeaders,
      })
      if (!response.ok || !response.body) {
        throw new Error(
          `Failed to fetch video for upload (${response.status}): ${params.sourceUrl}`,
        )
      }

      const upload = new Upload({
        client: r2,
        params: {
          Bucket: process.env.R2_BUCKET_NAME!,
          Key: params.key,
          Body: response.body as ReadableStream,
          ContentType: params.mimeType,
          CacheControl: 'public, max-age=31536000, immutable',
        },
        queueSize: 1,
        partSize: 5 * 1024 * 1024, // 5MB parts
      })

      await upload.done()

      const contentLength = response.headers.get('content-length')
      const sizeBytes = contentLength ? Number.parseInt(contentLength, 10) : 0

      logger.info('Stream uploaded to R2', {
        key: params.key,
        sizeBytes,
        mimeType: params.mimeType,
      })

      return {
        publicUrl: `${process.env.NEXT_PUBLIC_STORAGE_BASE_URL}/${params.key}`,
        sizeBytes,
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
  assertSafeUrl(params.sourceUrl)

  return withRetry(
    async () => {
      const response = await fetch(params.sourceUrl, {
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
      const response = await fetch(params.sourceUrl, {
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
