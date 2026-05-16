import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { VOICE_API_ERROR_CODES } from '@/constants/voice-cards'
import { findActiveKeyForAdapter } from '@/services/apiKey.service'
import { transcribeAudio } from '@/services/fish-audio-voice.service'
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
    const result = await transcribeAudio(apiKey.keyValue, {
      audio: Buffer.from(await audio.arrayBuffer()),
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
