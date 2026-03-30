import { logger } from '@/lib/logger'
import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

import { ARENA } from '@/constants/config'
import type { ArenaHistoryResponse } from '@/types'
import { getArenaHistory } from '@/services/arena.service'

// ─── GET /api/arena/history — User's match history ──────────────

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json<ArenaHistoryResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const { searchParams } = new URL(req.url)
    const page = Math.max(1, Number(searchParams.get('page') ?? '1'))
    const limit = Math.min(
      50,
      Math.max(1, Number(searchParams.get('limit') ?? ARENA.HISTORY_PAGE_SIZE)),
    )

    const result = await getArenaHistory(userId, page, limit)

    return NextResponse.json<ArenaHistoryResponse>({
      success: true,
      data: result,
    })
  } catch (error) {
    logger.error('[API /api/arena/history] Error', { error: error instanceof Error ? error.message : String(error) })
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return NextResponse.json<ArenaHistoryResponse>(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
