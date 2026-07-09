import 'server-only'

import {
  USER_UPLOAD_ACCEPTED_SHARP_FORMATS,
  USER_UPLOAD_DIRECT_URL_EXPIRES_SECONDS,
  USER_UPLOAD_MAX_BYTES,
  USER_UPLOAD_PROVIDER,
} from '@/constants/uploads'
import { createGeneration } from '@/services/generation.service'
import {
  createImageThumbnailAsset,
  createPresignedR2PutUrl,
  deleteFromR2,
  detectTrustedImageMime,
  fetchAsBuffer,
  generateStorageKey,
  getR2ObjectBuffer,
  getR2PublicUrl,
  uploadToR2,
} from '@/services/storage/r2'
import { ensureUser } from '@/services/user.service'
import type {
  CompleteUploadImageDirectRequest,
  CreateUploadImageDirectRequest,
  DirectUploadImagePrepare,
  GenerationRecord,
  UploadImageRequest,
} from '@/types'
import { GenerateImageServiceError } from '@/services/image/generate-image.service'

/**
 * Shared persistence step for both upload paths (local multipart file and
 * remote-URL import). The original bytes are stored in R2 *as-is* — no
 * re-encode, no downscale, so a good image keeps its quality — and only a
 * grid-tile thumbnail is derived (the detail view serves the original). The
 * buffer is validated by libvips magic bytes so a client can't smuggle a
 * disallowed or corrupt format past the claimed MIME.
 */
async function storeUserUpload(params: {
  userId: string
  buffer: Buffer
  note?: string
  projectId?: string
}): Promise<GenerationRecord> {
  const { userId, buffer, note, projectId } = params

  if (buffer.byteLength > USER_UPLOAD_MAX_BYTES) {
    throw new GenerateImageServiceError(
      'PROVIDER_ERROR',
      `File too large (${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB, max ${USER_UPLOAD_MAX_BYTES / 1024 / 1024} MB)`,
      400,
    )
  }

  let trustedMimeType: string
  let detectedWidth: number
  let detectedHeight: number
  try {
    const detected = await detectTrustedImageMime(
      buffer,
      USER_UPLOAD_ACCEPTED_SHARP_FORMATS,
    )
    trustedMimeType = detected.mimeType
    detectedWidth = detected.width
    detectedHeight = detected.height
  } catch (error) {
    throw new GenerateImageServiceError(
      'PROVIDER_ERROR',
      error instanceof Error ? error.message : 'Invalid image file',
      400,
    )
  }

  const storageKey = generateStorageKey('IMAGE', userId)
  const [publicUrl, thumbnail] = await Promise.all([
    uploadToR2({
      data: buffer,
      key: storageKey,
      mimeType: trustedMimeType,
    }),
    createImageThumbnailAsset({
      sourceBuffer: buffer,
      sourceStorageKey: storageKey,
    }),
  ])

  return createGeneration({
    url: publicUrl,
    storageKey,
    mimeType: trustedMimeType,
    thumbnailUrl: thumbnail.thumbnailUrl,
    thumbnailStorageKey: thumbnail.thumbnailStorageKey,
    width: detectedWidth,
    height: detectedHeight,
    prompt: note ?? '',
    model: USER_UPLOAD_PROVIDER,
    provider: USER_UPLOAD_PROVIDER,
    requestCount: 0,
    outputType: 'IMAGE',
    isFreeGeneration: true,
    userId,
    projectId,
  })
}

/**
 * Persist a user-uploaded image as a first-class Generation row tagged with
 * `USER_UPLOAD_PROVIDER` so it surfaces in the asset browser's "Local
 * assets" sidebar and is reusable as a source for any downstream tool
 * (3D, video, etc.) without re-uploading.
 *
 * JSON path: accepts a base64 data URL (legacy) or a remote https URL the
 * server fetches. Local files should use the multipart `uploadUserImageFile`
 * path instead — it avoids base64 inflation and preserves original quality.
 */
export async function uploadUserImage(
  clerkId: string,
  input: UploadImageRequest,
): Promise<GenerationRecord> {
  const dbUser = await ensureUser(clerkId)
  return uploadUserImageForUserId(dbUser.id, input)
}

export async function uploadUserImageForUserId(
  userId: string,
  input: UploadImageRequest,
): Promise<GenerationRecord> {
  const sourceUrl = input.imageDataUrl ?? input.imageUrl
  if (!sourceUrl) {
    throw new GenerateImageServiceError(
      'PROVIDER_ERROR',
      'Either imageDataUrl or imageUrl must be provided',
      400,
    )
  }

  const { buffer } = await fetchAsBuffer(sourceUrl, {
    maxBytes: USER_UPLOAD_MAX_BYTES,
  })

  return storeUserUpload({
    userId,
    buffer,
    note: input.note,
    projectId: input.projectId,
  })
}

export interface UploadUserImageFileInput {
  fileBuffer: Buffer
  /** MIME the client claimed; kept for logging — the real format is detected. */
  claimedMimeType?: string
  note?: string
  projectId?: string
}

/**
 * Multipart path for local-file uploads: the raw file bytes arrive as a
 * Buffer (no base64), get validated + stored as-is. Mirrors the LoRA-training
 * and reference-video upload routes.
 */
export async function uploadUserImageFile(
  clerkId: string,
  input: UploadUserImageFileInput,
): Promise<GenerationRecord> {
  const dbUser = await ensureUser(clerkId)
  return storeUserUpload({
    userId: dbUser.id,
    buffer: input.fileBuffer,
    note: input.note,
    projectId: input.projectId,
  })
}

function assertDirectUploadSize(sizeBytes: number) {
  if (sizeBytes <= USER_UPLOAD_MAX_BYTES) return

  throw new GenerateImageServiceError(
    'PROVIDER_ERROR',
    `File too large (${(sizeBytes / 1024 / 1024).toFixed(1)} MB, max ${USER_UPLOAD_MAX_BYTES / 1024 / 1024} MB)`,
    400,
  )
}

function assertDirectUploadStorageKeyForUser(
  storageKey: string,
  userId: string,
) {
  const expectedPrefix = `generations/${userId}/image/`
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

export async function createUserImageDirectUpload(
  clerkId: string,
  input: CreateUploadImageDirectRequest,
): Promise<DirectUploadImagePrepare> {
  assertDirectUploadSize(input.sizeBytes)

  const dbUser = await ensureUser(clerkId)
  const storageKey = generateStorageKey('IMAGE', dbUser.id)
  const uploadUrl = await createPresignedR2PutUrl({
    key: storageKey,
    mimeType: input.mimeType,
    expiresInSeconds: USER_UPLOAD_DIRECT_URL_EXPIRES_SECONDS,
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
      Date.now() + USER_UPLOAD_DIRECT_URL_EXPIRES_SECONDS * 1000,
    ).toISOString(),
    maxBytes: USER_UPLOAD_MAX_BYTES,
  }
}

export async function completeUserImageDirectUpload(
  clerkId: string,
  input: CompleteUploadImageDirectRequest,
): Promise<GenerationRecord> {
  assertDirectUploadSize(input.sizeBytes)

  const dbUser = await ensureUser(clerkId)
  assertDirectUploadStorageKeyForUser(input.storageKey, dbUser.id)

  const cleanupUploadedObject = async () => {
    await deleteFromR2(input.storageKey).catch(() => undefined)
  }

  const { buffer } = await getR2ObjectBuffer({
    key: input.storageKey,
    maxBytes: USER_UPLOAD_MAX_BYTES,
  }).catch(async (error: unknown) => {
    await cleanupUploadedObject()
    throw new GenerateImageServiceError(
      'PROVIDER_ERROR',
      error instanceof Error ? error.message : 'Failed to read uploaded image',
      400,
    )
  })

  if (buffer.byteLength !== input.sizeBytes) {
    await cleanupUploadedObject()
    throw new GenerateImageServiceError(
      'PROVIDER_ERROR',
      'Uploaded image size does not match the prepared upload',
      400,
    )
  }

  let trustedMimeType: string
  let detectedWidth: number
  let detectedHeight: number
  try {
    const detected = await detectTrustedImageMime(
      buffer,
      USER_UPLOAD_ACCEPTED_SHARP_FORMATS,
    )
    trustedMimeType = detected.mimeType
    detectedWidth = detected.width
    detectedHeight = detected.height
  } catch (error) {
    await cleanupUploadedObject()
    throw new GenerateImageServiceError(
      'PROVIDER_ERROR',
      error instanceof Error ? error.message : 'Invalid image file',
      400,
    )
  }

  const thumbnail = await createImageThumbnailAsset({
    sourceBuffer: buffer,
    sourceStorageKey: input.storageKey,
  })

  return createGeneration({
    url: getR2PublicUrl(input.storageKey),
    storageKey: input.storageKey,
    mimeType: trustedMimeType,
    thumbnailUrl: thumbnail.thumbnailUrl,
    thumbnailStorageKey: thumbnail.thumbnailStorageKey,
    width: detectedWidth,
    height: detectedHeight,
    prompt: input.note ?? '',
    model: USER_UPLOAD_PROVIDER,
    provider: USER_UPLOAD_PROVIDER,
    requestCount: 0,
    outputType: 'IMAGE',
    isFreeGeneration: true,
    userId: dbUser.id,
    projectId: input.projectId,
  })
}
