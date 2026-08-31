import 'server-only'

import {
  USER_AUDIO_UPLOAD_DIRECT_URL_EXPIRES_SECONDS,
  USER_AUDIO_UPLOAD_MAX_BYTES,
  USER_AUDIO_UPLOAD_SIGNATURE_BYTES,
  USER_UPLOAD_PROVIDER,
  type AcceptedAudioUploadMimeType,
} from '@/constants/uploads'
import { createGeneration } from '@/services/generation.service'
import { GenerateImageServiceError } from '@/services/image/generate-image.service'
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
  CompleteUploadAudioDirectRequest,
  CreateUploadAudioDirectRequest,
  DirectUploadAudioPrepare,
  GenerationRecord,
} from '@/types'

function canonicalAudioMime(mimeType: string): string {
  if (mimeType === 'audio/mp3') return 'audio/mpeg'
  if (mimeType === 'audio/wave' || mimeType === 'audio/x-wav') {
    return 'audio/wav'
  }
  if (mimeType === 'audio/m4a' || mimeType === 'audio/x-m4a') {
    return 'audio/mp4'
  }
  if (mimeType === 'audio/x-flac') return 'audio/flac'
  return mimeType
}

function audioExtension(mimeType: AcceptedAudioUploadMimeType): string {
  const canonicalMime = canonicalAudioMime(mimeType)
  if (canonicalMime === 'audio/wav') return 'wav'
  if (canonicalMime === 'audio/mp4') return 'm4a'
  if (canonicalMime === 'audio/flac') return 'flac'
  if (canonicalMime === 'audio/ogg') return 'ogg'
  if (canonicalMime === 'audio/webm') return 'webm'
  return 'mp3'
}

/** Validate audio bytes without trusting the browser-provided MIME type. */
export function detectTrustedAudioMime(buffer: Buffer): string {
  if (buffer.byteLength < 4) {
    throw new Error('Invalid or empty audio file')
  }

  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' ||
    buffer.subarray(0, 4).toString('ascii') === 'RF64'
  ) {
    if (
      buffer.byteLength >= 12 &&
      buffer.subarray(8, 12).toString('ascii') === 'WAVE'
    ) {
      return 'audio/wav'
    }
  }

  if (buffer.subarray(0, 4).toString('ascii') === 'fLaC') {
    return 'audio/flac'
  }

  if (buffer.subarray(0, 4).toString('ascii') === 'OggS') {
    return 'audio/ogg'
  }

  if (
    buffer.byteLength >= 12 &&
    buffer.subarray(4, 8).toString('ascii') === 'ftyp'
  ) {
    return 'audio/mp4'
  }

  const hasEbmlHeader =
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3
  const headerText = buffer
    .subarray(0, Math.min(buffer.length, USER_AUDIO_UPLOAD_SIGNATURE_BYTES))
    .toString()
  if (hasEbmlHeader && headerText.toLowerCase().includes('webm')) {
    return 'audio/webm'
  }

  const hasId3Header = buffer.subarray(0, 3).toString('ascii') === 'ID3'
  const hasMpegFrameSync = buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0
  if (hasId3Header || hasMpegFrameSync) {
    return 'audio/mpeg'
  }

  throw new Error('Unsupported or invalid audio file')
}

function assertAudioUploadSize(sizeBytes: number) {
  if (sizeBytes <= USER_AUDIO_UPLOAD_MAX_BYTES) return

  throw new GenerateImageServiceError(
    'PROVIDER_ERROR',
    `Audio too large (${(sizeBytes / 1024 / 1024).toFixed(1)} MB, max ${USER_AUDIO_UPLOAD_MAX_BYTES / 1024 / 1024} MB)`,
    400,
  )
}

function assertAudioStorageKeyForUser(storageKey: string, userId: string) {
  const expectedPrefix = `generations/${userId}/audio/`
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

export async function createUserAudioDirectUpload(
  clerkId: string,
  input: CreateUploadAudioDirectRequest,
): Promise<DirectUploadAudioPrepare> {
  assertAudioUploadSize(input.sizeBytes)

  const dbUser = await ensureUser(clerkId)
  const storageKey = generateStorageKey(
    'AUDIO',
    dbUser.id,
    audioExtension(input.mimeType),
  )
  const uploadUrl = await createPresignedR2PutUrl({
    key: storageKey,
    mimeType: input.mimeType,
    expiresInSeconds: USER_AUDIO_UPLOAD_DIRECT_URL_EXPIRES_SECONDS,
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
      Date.now() + USER_AUDIO_UPLOAD_DIRECT_URL_EXPIRES_SECONDS * 1000,
    ).toISOString(),
    maxBytes: USER_AUDIO_UPLOAD_MAX_BYTES,
  }
}

export async function completeUserAudioDirectUpload(
  clerkId: string,
  input: CompleteUploadAudioDirectRequest,
): Promise<GenerationRecord> {
  assertAudioUploadSize(input.sizeBytes)

  const dbUser = await ensureUser(clerkId)
  assertAudioStorageKeyForUser(input.storageKey, dbUser.id)

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
        : 'Failed to inspect uploaded audio',
      400,
    )
  })

  if (
    storedSizeBytes > USER_AUDIO_UPLOAD_MAX_BYTES ||
    storedSizeBytes !== input.sizeBytes
  ) {
    await cleanupUploadedObject()
    throw new GenerateImageServiceError(
      'PROVIDER_ERROR',
      'Uploaded audio size does not match the prepared upload',
      400,
    )
  }

  const { buffer } = await getR2ObjectRange({
    key: input.storageKey,
    startByte: 0,
    endByteInclusive:
      Math.min(storedSizeBytes, USER_AUDIO_UPLOAD_SIGNATURE_BYTES) - 1,
  }).catch(async (error: unknown) => {
    await cleanupUploadedObject()
    throw new GenerateImageServiceError(
      'PROVIDER_ERROR',
      error instanceof Error
        ? error.message
        : 'Failed to read uploaded audio header',
      400,
    )
  })

  let trustedMimeType: string
  try {
    trustedMimeType = detectTrustedAudioMime(buffer)
  } catch (error) {
    await cleanupUploadedObject()
    throw new GenerateImageServiceError(
      'PROVIDER_ERROR',
      error instanceof Error ? error.message : 'Invalid audio file',
      400,
    )
  }

  if (trustedMimeType !== canonicalAudioMime(input.mimeType)) {
    await cleanupUploadedObject()
    throw new GenerateImageServiceError(
      'PROVIDER_ERROR',
      'Uploaded audio type does not match the prepared upload',
      400,
    )
  }

  return createGeneration({
    url: getR2PublicUrl(input.storageKey),
    storageKey: input.storageKey,
    mimeType: trustedMimeType,
    width: 0,
    height: 0,
    duration: input.duration,
    prompt: input.note ?? '',
    model: USER_UPLOAD_PROVIDER,
    provider: USER_UPLOAD_PROVIDER,
    requestCount: 0,
    outputType: 'AUDIO',
    isFreeGeneration: true,
    userId: dbUser.id,
    projectId: input.projectId,
  })
}
