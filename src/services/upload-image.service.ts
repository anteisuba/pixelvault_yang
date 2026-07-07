import 'server-only'

import {
  USER_UPLOAD_ACCEPTED_SHARP_FORMATS,
  USER_UPLOAD_MAX_BYTES,
  USER_UPLOAD_PROVIDER,
} from '@/constants/uploads'
import { createGeneration } from '@/services/generation.service'
import {
  createImageThumbnailAsset,
  detectTrustedImageMime,
  fetchAsBuffer,
  generateStorageKey,
  uploadToR2,
} from '@/services/storage/r2'
import { ensureUser } from '@/services/user.service'
import type { GenerationRecord, UploadImageRequest } from '@/types'
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
