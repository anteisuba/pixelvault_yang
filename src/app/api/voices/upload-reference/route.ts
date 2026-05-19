import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import {
  REFERENCE_AUDIO_MAX_BYTES,
  uploadReferenceAudio,
  validateReferenceAudio,
} from '@/services/audio-reference.service'
import { ensureUser } from '@/services/user.service'
import { logger } from '@/lib/logger'

export const maxDuration = 60

function isUploadedAudio(value: FormDataEntryValue | null): value is File {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const candidate = value as {
    arrayBuffer?: unknown
    size?: unknown
    type?: unknown
  }

  return (
    typeof candidate.arrayBuffer === 'function' &&
    typeof candidate.size === 'number' &&
    typeof candidate.type === 'string'
  )
}

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    // Reject obviously oversized payloads before draining the request body.
    // The browser fetch API still sends the entire payload before we read
    // it, but checking Content-Length lets us short-circuit a corrupted
    // proxy that lies about file size.
    const contentLength = Number(request.headers.get('content-length') ?? 0)
    if (contentLength > REFERENCE_AUDIO_MAX_BYTES * 1.05) {
      return NextResponse.json(
        {
          success: false,
          error: `Audio file exceeds the ${Math.round(
            REFERENCE_AUDIO_MAX_BYTES / 1024 / 1024,
          )} MB limit.`,
          errorCode: 'AUDIO_TOO_LARGE',
        },
        { status: 413 },
      )
    }

    const formData = await request.formData()
    const audio = formData.get('audio')
    if (!isUploadedAudio(audio)) {
      return NextResponse.json(
        { success: false, error: 'Audio file is required' },
        { status: 400 },
      )
    }

    const fileBuffer = Buffer.from(await audio.arrayBuffer())
    const error = validateReferenceAudio(fileBuffer, audio.type)
    if (error) {
      return NextResponse.json(
        { success: false, error: error.message, errorCode: error.code },
        { status: error.code === 'AUDIO_TOO_LARGE' ? 413 : 400 },
      )
    }

    const dbUser = await ensureUser(clerkId)
    const uploaded = await uploadReferenceAudio({
      userId: dbUser.id,
      fileBuffer,
      mimeType: audio.type,
    })

    return NextResponse.json({
      success: true,
      data: {
        url: uploaded.url,
        sizeBytes: uploaded.sizeBytes,
        mimeType: uploaded.mimeType,
        fileName: audio.name || `reference.${uploaded.mimeType.split('/')[1]}`,
      },
    })
  } catch (error) {
    logger.error('POST /api/voices/upload-reference error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { success: false, error: 'Failed to upload reference audio' },
      { status: 500 },
    )
  }
}
