import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { VOICE_API_ERROR_CODES } from '@/constants/voice-cards'
import { findActiveKeyForAdapter } from '@/services/apiKey.service'
import { transcribeAudio } from '@/services/fish-audio-voice.service'
import {
  REFERENCE_AUDIO_MAX_BYTES,
  validateReferenceAudio,
} from '@/services/audio-reference.service'
import { ensureUser } from '@/services/user.service'
import { logger } from '@/lib/logger'

export const maxDuration = 60

const FISH_AUDIO_KEY_REQUIRED_ERROR = {
  success: false,
  errorCode: VOICE_API_ERROR_CODES.MISSING_API_KEY,
  error: 'Fish Audio API key is required.',
} as const

function isUploadedAudio(value: FormDataEntryValue | null): value is File {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const candidate = value as {
    arrayBuffer?: unknown
    size?: unknown
  }

  return (
    typeof candidate.arrayBuffer === 'function' &&
    typeof candidate.size === 'number'
  )
}

function getUploadedAudioFileName(audio: File) {
  return audio.name.trim() ? audio.name : 'audio'
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

    const dbUser = await ensureUser(clerkId)
    const apiKey = await findActiveKeyForAdapter(
      dbUser.id,
      AI_ADAPTER_TYPES.FISH_AUDIO,
    )

    if (!apiKey) {
      return NextResponse.json(FISH_AUDIO_KEY_REQUIRED_ERROR, { status: 400 })
    }

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

    const language = formData.get('language')
    const ignoreTimestamps = formData.get('ignore_timestamps')
    const audioBuffer = Buffer.from(await audio.arrayBuffer())
    const validationError = validateReferenceAudio(audioBuffer, audio.type)
    if (validationError) {
      return NextResponse.json(
        {
          success: false,
          error: validationError.message,
          errorCode: validationError.code,
        },
        { status: validationError.code === 'AUDIO_TOO_LARGE' ? 413 : 400 },
      )
    }

    const result = await transcribeAudio(apiKey.keyValue, {
      audio: audioBuffer,
      fileName: getUploadedAudioFileName(audio),
      language: typeof language === 'string' ? language : undefined,
      ignoreTimestamps: ignoreTimestamps !== 'false',
    })

    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    logger.error('POST /api/voices/transcribe error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { success: false, error: 'Failed to transcribe audio' },
      { status: 500 },
    )
  }
}
