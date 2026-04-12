import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { ensureUser } from '@/services/user.service'
import { findActiveKeyForAdapter } from '@/services/apiKey.service'
import { getVoice, deleteVoice } from '@/services/fish-audio-voice.service'
import { logger } from '@/lib/logger'

export const maxDuration = 30

// ─── GET /api/voices/[id] — get voice detail ─────────────────────

export async function GET(
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
    const voice = await getVoice(apiKey.keyValue, id)
    return NextResponse.json({ success: true, data: voice })
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
