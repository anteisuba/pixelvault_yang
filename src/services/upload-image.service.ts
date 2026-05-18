import 'server-only'

import {
  USER_UPLOAD_ACCEPTED_SHARP_FORMATS,
  USER_UPLOAD_MAX_BYTES,
  USER_UPLOAD_PROVIDER,
} from '@/constants/uploads'
import { createGeneration } from '@/services/generation.service'
import {
  createImagePreviewAssets,
  detectTrustedImageMime,
  fetchAsBuffer,
  generateStorageKey,
  uploadToR2,
} from '@/services/storage/r2'
import { ensureUser } from '@/services/user.service'
import type { GenerationRecord, UploadImageRequest } from '@/types'
import { GenerateImageServiceError } from '@/services/generate-image.service'

/**
 * Persist a user-uploaded image as a first-class Generation row tagged with
 * `USER_UPLOAD_PROVIDER` so it surfaces in the asset browser's "Local
 * assets" sidebar and is reusable as a source for any downstream tool
 * (3D, video, etc.) without re-uploading.
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
  const [publicUrl, previewAssets] = await Promise.all([
    uploadToR2({
      data: buffer,
      key: storageKey,
      mimeType: trustedMimeType,
    }),
    createImagePreviewAssets({
      sourceBuffer: buffer,
      sourceStorageKey: storageKey,
    }),
  ])

  return createGeneration({
    url: publicUrl,
    storageKey,
    mimeType: trustedMimeType,
    thumbnailUrl: previewAssets.thumbnailUrl,
    thumbnailStorageKey: previewAssets.thumbnailStorageKey,
    previewUrl: previewAssets.previewUrl,
    previewStorageKey: previewAssets.previewStorageKey,
    width: detectedWidth,
    height: detectedHeight,
    prompt: input.note ?? '',
    model: USER_UPLOAD_PROVIDER,
    provider: USER_UPLOAD_PROVIDER,
    requestCount: 0,
    outputType: 'IMAGE',
    isFreeGeneration: true,
    userId,
    projectId: input.projectId,
  })
}
