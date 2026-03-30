import { logger } from '@/lib/logger'
import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

import type { ArenaPersonalStatsResponse } from '@/types'
import { getPersonalArenaStats } from '@/services/arena.service'

// ─── GET /api/arena/personal-stats — User's per-model stats ─────

export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json<ArenaPersonalStatsResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const result = await getPersonalArenaStats(userId)

    return NextResponse.json<ArenaPersonalStatsResponse>({
      success: true,
      data: result,
    })
  } catch (error) {
    logger.error('[API /api/arena/personal-stats] Error', { error: error instanceof Error ? error.message : String(error) })
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return NextResponse.json<ArenaPersonalStatsResponse>(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
