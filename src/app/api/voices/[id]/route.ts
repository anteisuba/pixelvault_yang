import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  FISH_AUDIO_VOICE_ID_PATTERN,
  VOICE_API_ERROR_CODES,
} from '@/constants/voice-cards'
import { ensureUser } from '@/services/user.service'
import { findActiveKeyForAdapter } from '@/services/apiKey.service'
import { getVoice, deleteVoice } from '@/services/fish-audio-voice.service'
import { getFishAudioVoiceLibraryApiKey } from '@/lib/platform-keys'
import { getClientIp } from '@/lib/client-ip'
import { logger } from '@/lib/logger'
import { rateLimit } from '@/lib/rate-limit'

export const maxDuration = 30
const PUBLIC_VOICE_LIBRARY_CACHE_CONTROL =
  'public, s-maxage=300, stale-while-revalidate=900'

const PUBLIC_VOICE_LIBRARY_UNAVAILABLE_ERROR = {
  success: false,
  errorCode: VOICE_API_ERROR_CODES.PUBLIC_LIBRARY_UNAVAILABLE,
  error: 'Fish Audio public voice library is unavailable.',
} as const

const INVALID_VOICE_ID_ERROR = {
  success: false,
  errorCode: VOICE_API_ERROR_CODES.INVALID_VOICE_ID,
  error: 'Invalid voice id.',
} as const

const RATE_LIMITED_ERROR = {
  success: false,
  errorCode: VOICE_API_ERROR_CODES.RATE_LIMITED,
  error: 'Too many requests.',
} as const

// ─── GET /api/voices/[id] — get voice detail ─────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    // 匿名可达 + 平台 key：id 先过形状（防 `../` 把平台 key 引到别的接口），再按 IP 限。
    if (!FISH_AUDIO_VOICE_ID_PATTERN.test(id)) {
      return NextResponse.json(INVALID_VOICE_ID_ERROR, { status: 400 })
    }
    const limited = await rateLimit(
      `voices:public:${getClientIp(request.headers)}`,
      RATE_LIMIT_CONFIGS.anonymousPlatformRead,
    )
    if (!limited.success) {
      return NextResponse.json(RATE_LIMITED_ERROR, { status: 429 })
    }

    const publicLibraryApiKey = getFishAudioVoiceLibraryApiKey()
    if (!publicLibraryApiKey) {
      return NextResponse.json(PUBLIC_VOICE_LIBRARY_UNAVAILABLE_ERROR, {
        status: 503,
      })
    }

    const voice = await getVoice(publicLibraryApiKey, id)
    const response = NextResponse.json({ success: true, data: voice })
    response.headers.set('Cache-Control', PUBLIC_VOICE_LIBRARY_CACHE_CONTROL)
    return response
  } catch (error) {
    logger.error('GET /api/voices/[id] error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { success: false, error: 'Failed to get voice' },
      { status: 500 },
    )
  }
}

// ─── DELETE /api/voices/[id] — delete voice ──────────────────────

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const { id } = await params
    if (!FISH_AUDIO_VOICE_ID_PATTERN.test(id)) {
      return NextResponse.json(INVALID_VOICE_ID_ERROR, { status: 400 })
    }

    const dbUser = await ensureUser(clerkId)
    const apiKey = await findActiveKeyForAdapter(
      dbUser.id,
      AI_ADAPTER_TYPES.FISH_AUDIO,
    )

    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'No active Fish Audio API key' },
        { status: 400 },
      )
    }

    await deleteVoice(apiKey.keyValue, id)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    logger.error('DELETE /api/voices/[id] error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { success: false, error: 'Failed to delete voice' },
      { status: 500 },
    )
  }
}
