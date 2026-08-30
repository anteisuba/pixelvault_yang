import 'server-only'

import {
  USER_UPLOAD_PROVIDER,
  USER_VIDEO_UPLOAD_DIRECT_URL_EXPIRES_SECONDS,
  USER_VIDEO_UPLOAD_MAX_BYTES,
  USER_VIDEO_UPLOAD_SIGNATURE_BYTES,
  type AcceptedVideoUploadMimeType,
} from '@/constants/uploads'
import { GenerateImageServiceError } from '@/services/image/generate-image.service'
import { createGeneration } from '@/services/generation.service'
import {
  createPresignedR2PutUrl,
  deleteFromR2,
  generateStorageKey,
  getR2ObjectMetadata,
  getR2ObjectRange,
  getR2PublicUrl,
} from '@/services/storage/r2'
import { ensureUser } from '@/services/user.service'
import type {
  CompleteUploadVideoDirectRequest,
  CreateUploadVideoDirectRequest,
  DirectUploadVideoPrepare,
  GenerationRecord,
} from '@/types'

function canonicalVideoMime(mimeType: string): string {
  return mimeType === 'video/x-quicktime' ? 'video/quicktime' : mimeType
}

function videoExtension(mimeType: AcceptedVideoUploadMimeType): string {
  if (mimeType === 'video/webm') return 'webm'
  if (mimeType === 'video/quicktime' || mimeType === 'video/x-quicktime') {
    return 'mov'
  }
  return 'mp4'
}

/**
 * Validate the container from bytes instead of trusting the browser MIME.
 * MP4/QuickTime are ISO-BMFF (`ftyp` box); WebM is EBML with a `webm`
 * DocType near the start of the header.
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

function assertVideoUploadSize(sizeBytes: number) {
  if (sizeBytes <= USER_VIDEO_UPLOAD_MAX_BYTES) return

  throw new GenerateImageServiceError(
    'PROVIDER_ERROR',
    `Video too large (${(sizeBytes / 1024 / 1024).toFixed(1)} MB, max ${USER_VIDEO_UPLOAD_MAX_BYTES / 1024 / 1024} MB)`,
    400,
  )
}

function assertVideoStorageKeyForUser(storageKey: string, userId: string) {
  const expectedPrefix = `generations/${userId}/video/`
  const hasUnsafePath =
    storageKey.includes('..') ||
    storageKey.startsWith('/') ||
    storageKey.endsWith('/')

  if (!storageKey.startsWith(expectedPrefix) || hasUnsafePath) {
    throw new GenerateImageServiceError(
      'PROVIDER_ERROR',
      'Upload storage key is not valid for this user',
      403,
    )
  }
}

export async function createUserVideoDirectUpload(
  clerkId: string,
  input: CreateUploadVideoDirectRequest,
): Promise<DirectUploadVideoPrepare> {
  assertVideoUploadSize(input.sizeBytes)

  const dbUser = await ensureUser(clerkId)
  const storageKey = generateStorageKey(
    'VIDEO',
    dbUser.id,
    videoExtension(input.mimeType),
  )
  const uploadUrl = await createPresignedR2PutUrl({
    key: storageKey,
    mimeType: input.mimeType,
    expiresInSeconds: USER_VIDEO_UPLOAD_DIRECT_URL_EXPIRES_SECONDS,
  })

  return {
    uploadUrl,
    storageKey,
    publicUrl: getR2PublicUrl(storageKey),
    headers: {
      'Content-Type': input.mimeType,
      'If-None-Match': '*',
    },
    expiresAt: new Date(
      Date.now() + USER_VIDEO_UPLOAD_DIRECT_URL_EXPIRES_SECONDS * 1000,
    ).toISOString(),
    maxBytes: USER_VIDEO_UPLOAD_MAX_BYTES,
  }
}

export async function completeUserVideoDirectUpload(
  clerkId: string,
  input: CompleteUploadVideoDirectRequest,
): Promise<GenerationRecord> {
  assertVideoUploadSize(input.sizeBytes)

  const dbUser = await ensureUser(clerkId)
  assertVideoStorageKeyForUser(input.storageKey, dbUser.id)

  const cleanupUploadedObject = async () => {
    await deleteFromR2(input.storageKey).catch(() => undefined)
  }

  const { sizeBytes: storedSizeBytes } = await getR2ObjectMetadata({
    key: input.storageKey,
  }).catch(async (error: unknown) => {
    await cleanupUploadedObject()
    throw new GenerateImageServiceError(
      'PROVIDER_ERROR',
      error instanceof Error
        ? error.message
        : 'Failed to inspect uploaded video',
      400,
    )
  })

  if (
    storedSizeBytes > USER_VIDEO_UPLOAD_MAX_BYTES ||
    storedSizeBytes !== input.sizeBytes
  ) {
    await cleanupUploadedObject()
    throw new GenerateImageServiceError(
      'PROVIDER_ERROR',
      'Uploaded video size does not match the prepared upload',
      400,
    )
  }

  const { buffer } = await getR2ObjectRange({
    key: input.storageKey,
    startByte: 0,
    endByteInclusive:
      Math.min(storedSizeBytes, USER_VIDEO_UPLOAD_SIGNATURE_BYTES) - 1,
  }).catch(async (error: unknown) => {
    await cleanupUploadedObject()
    throw new GenerateImageServiceError(
      'PROVIDER_ERROR',
      error instanceof Error
        ? error.message
        : 'Failed to read uploaded video header',
      400,
    )
  })

  let trustedMimeType: string
  try {
    trustedMimeType = detectTrustedVideoMime(buffer)
  } catch (error) {
    await cleanupUploadedObject()
    throw new GenerateImageServiceError(
      'PROVIDER_ERROR',
      error instanceof Error ? error.message : 'Invalid video file',
      400,
    )
  }

  if (trustedMimeType !== canonicalVideoMime(input.mimeType)) {
    await cleanupUploadedObject()
    throw new GenerateImageServiceError(
      'PROVIDER_ERROR',
      'Uploaded video type does not match the prepared upload',
      400,
    )
  }

  return createGeneration({
    url: getR2PublicUrl(input.storageKey),
    storageKey: input.storageKey,
    mimeType: trustedMimeType,
    width: input.width,
    height: input.height,
    duration: input.duration,
    prompt: input.note ?? '',
    model: USER_UPLOAD_PROVIDER,
    provider: USER_UPLOAD_PROVIDER,
    requestCount: 0,
    outputType: 'VIDEO',
    isFreeGeneration: true,
    userId: dbUser.id,
    projectId: input.projectId,
  })
}
