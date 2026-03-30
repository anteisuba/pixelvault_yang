import { logger } from '@/lib/logger'
import { NextResponse } from 'next/server'
import type { ArenaLeaderboardResponse } from '@/types'
import { getArenaLeaderboard } from '@/services/arena.service'

// ─── GET /api/arena/leaderboard — Public, no auth ────────────────

export async function GET() {
  try {
    const leaderboard = await getArenaLeaderboard()

    return NextResponse.json<ArenaLeaderboardResponse>({
      success: true,
      data: leaderboard,
    })
  } catch (error) {
    logger.error('[API /api/arena/leaderboard] Error', { error: error instanceof Error ? error.message : String(error) })
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return NextResponse.json<ArenaLeaderboardResponse>(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
