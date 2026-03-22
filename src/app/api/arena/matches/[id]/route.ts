import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import type { ArenaMatchResponse } from '@/types'
import { getArenaMatch } from '@/services/arena.service'

// ─── GET /api/arena/matches/[id] — Poll match status ─────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json<ArenaMatchResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const { id } = await params
    const match = await getArenaMatch(id, clerkId)

    if (!match) {
      return NextResponse.json<ArenaMatchResponse>(
        { success: false, error: 'Match not found' },
        { status: 404 },
      )
    }

    return NextResponse.json<ArenaMatchResponse>({
      success: true,
      data: match,
    })
  } catch (error) {
    console.error('[API /api/arena/matches/[id]] Error:', error)
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return NextResponse.json<ArenaMatchResponse>(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
