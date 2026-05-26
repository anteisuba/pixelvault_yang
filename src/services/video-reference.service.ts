import 'server-only'

import { randomBytes } from 'crypto'

import { uploadToR2 } from '@/services/storage/r2'

/**
 * Maximum reference video payload accepted from the client. fal Seedance
 * reference-to-video allows up to 50 MB combined across all video_urls; we
 * cap a single upload at 50 MB so a single clip can use the full budget.
 * Anything under this still has to pass fal's per-clip duration (≤15s) +
 * combined-duration (≤15s across all clips) limits downstream.
 */
export const REFERENCE_VIDEO_MAX_BYTES = 50 * 1024 * 1024

const SUPPORTED_VIDEO_MIMES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/x-quicktime',
  'video/webm',
])

function pickVideoExtension(mimeType: string): string {
  if (mimeType.includes('mp4')) return 'mp4'
  if (mimeType.includes('quicktime')) return 'mov'
  if (mimeType.includes('webm')) return 'webm'
  return 'mp4'
}

export interface UploadReferenceVideoParams {
  userId: string
  fileBuffer: Buffer
  mimeType: string
}

export interface UploadedReferenceVideo {
  url: string
  storageKey: string
  sizeBytes: number
  mimeType: string
}

export interface ReferenceVideoValidationError {
  code: 'VIDEO_TOO_LARGE' | 'UNSUPPORTED_VIDEO_TYPE' | 'EMPTY_VIDEO'
  message: string
}

export function validateReferenceVideo(
  fileBuffer: Buffer,
  mimeType: string,
): ReferenceVideoValidationError | null {
  if (fileBuffer.byteLength === 0) {
    return { code: 'EMPTY_VIDEO', message: 'Video file is empty.' }
  }
  if (fileBuffer.byteLength > REFERENCE_VIDEO_MAX_BYTES) {
    return {
      code: 'VIDEO_TOO_LARGE',
      message: `Video file exceeds the ${Math.round(
        REFERENCE_VIDEO_MAX_BYTES / 1024 / 1024,
      )} MB limit.`,
    }
  }
  if (!SUPPORTED_VIDEO_MIMES.has(mimeType.toLowerCase())) {
    return {
      code: 'UNSUPPORTED_VIDEO_TYPE',
      message: `Unsupported video MIME type: ${mimeType}`,
    }
  }
  return null
}

/**
 * Persist a user-uploaded reference video clip to R2 and return its public
 * URL. Reference video is a transient handle the user attaches to a
 * generation — we don't create a Generation row here, just write the bytes
 * and return the URL. The fal Seedance Reference adapter forwards the URL
 * through video_urls.
 */
export async function uploadReferenceVideo(
  params: UploadReferenceVideoParams,
): Promise<UploadedReferenceVideo> {
  const extension = pickVideoExtension(params.mimeType)
  const date = new Date().toISOString().slice(0, 10)
  const random = randomBytes(12).toString('hex')
  const storageKey = `video-references/${params.userId}/${date}_${random}.${extension}`

  const url = await uploadToR2({
    data: params.fileBuffer,
    key: storageKey,
    mimeType: params.mimeType,
  })

  return {
    url,
    storageKey,
    sizeBytes: params.fileBuffer.byteLength,
    mimeType: params.mimeType,
  }
}
