import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { VOICE_API_ERROR_CODES } from '@/constants/voice-cards'
import { ensureUser } from '@/services/user.service'
import { findActiveKeyForAdapter } from '@/services/apiKey.service'
import { getVoice, deleteVoice } from '@/services/fish-audio-voice.service'
import { getFishAudioVoiceLibraryApiKey } from '@/lib/platform-keys'
import { logger } from '@/lib/logger'

export const maxDuration = 30
const PUBLIC_VOICE_LIBRARY_CACHE_CONTROL =
  'public, s-maxage=300, stale-while-revalidate=900'

const PUBLIC_VOICE_LIBRARY_UNAVAILABLE_ERROR = {
  success: false,
  errorCode: VOICE_API_ERROR_CODES.PUBLIC_LIBRARY_UNAVAILABLE,
  error: 'Fish Audio public voice library is unavailable.',
} as const

// ─── GET /api/voices/[id] — get voice detail ─────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const publicLibraryApiKey = getFishAudioVoiceLibraryApiKey()
    if (!publicLibraryApiKey) {
      return NextResponse.json(PUBLIC_VOICE_LIBRARY_UNAVAILABLE_ERROR, {
        status: 503,
      })
    }

    const { id } = await params
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

    const { id } = await params
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
