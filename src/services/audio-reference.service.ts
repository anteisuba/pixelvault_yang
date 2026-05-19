import 'server-only'

import { randomBytes } from 'crypto'

import { uploadToR2 } from '@/services/storage/r2'

/**
 * Maximum reference audio payload accepted from the client. Fish Audio's
 * zero-shot ASR rejects clips over ~25 MB; mirror the same ceiling so we
 * fail before paying for the R2 round-trip when the file is obviously too
 * big. Anything under this still has to pass the provider's own limits
 * downstream.
 */
export const REFERENCE_AUDIO_MAX_BYTES = 25 * 1024 * 1024

const SUPPORTED_AUDIO_MIMES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/flac',
  'audio/x-flac',
])

function pickAudioExtension(mimeType: string): string {
  if (mimeType.includes('mp3') || mimeType === 'audio/mpeg') return 'mp3'
  if (mimeType.includes('wav') || mimeType.includes('wave')) return 'wav'
  if (mimeType.includes('webm')) return 'webm'
  if (mimeType.includes('ogg')) return 'ogg'
  if (mimeType.includes('flac')) return 'flac'
  if (mimeType.includes('m4a') || mimeType === 'audio/mp4') return 'm4a'
  return 'mp3'
}

export interface UploadReferenceAudioParams {
  userId: string
  fileBuffer: Buffer
  mimeType: string
}

export interface UploadedReferenceAudio {
  url: string
  storageKey: string
  sizeBytes: number
  mimeType: string
}

export interface ReferenceAudioValidationError {
  code: 'AUDIO_TOO_LARGE' | 'UNSUPPORTED_AUDIO_TYPE' | 'EMPTY_AUDIO'
  message: string
}

export function validateReferenceAudio(
  fileBuffer: Buffer,
  mimeType: string,
): ReferenceAudioValidationError | null {
  if (fileBuffer.byteLength === 0) {
    return { code: 'EMPTY_AUDIO', message: 'Audio file is empty.' }
  }
  if (fileBuffer.byteLength > REFERENCE_AUDIO_MAX_BYTES) {
    return {
      code: 'AUDIO_TOO_LARGE',
      message: `Audio file exceeds the ${Math.round(
        REFERENCE_AUDIO_MAX_BYTES / 1024 / 1024,
      )} MB limit.`,
    }
  }
  if (!SUPPORTED_AUDIO_MIMES.has(mimeType.toLowerCase())) {
    return {
      code: 'UNSUPPORTED_AUDIO_TYPE',
      message: `Unsupported audio MIME type: ${mimeType}`,
    }
  }
  return null
}

/**
 * Persist a user-uploaded reference clip to R2 and return its public URL.
 *
 * Reference audio is a transient handle the user attaches to a generation —
 * we don't create a Generation or VoiceCard row here, just write the bytes
 * and return the URL. The Fish Audio adapter forwards the URL through its
 * existing zero-shot `references` payload path.
 */
export async function uploadReferenceAudio(
  params: UploadReferenceAudioParams,
): Promise<UploadedReferenceAudio> {
  const extension = pickAudioExtension(params.mimeType)
  const date = new Date().toISOString().slice(0, 10)
  const random = randomBytes(12).toString('hex')
  const storageKey = `audio-references/${params.userId}/${date}_${random}.${extension}`

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
