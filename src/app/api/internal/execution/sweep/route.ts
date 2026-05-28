import 'server-only'

import { NextResponse } from 'next/server'

import { logger } from '@/lib/logger'
import { sweepStaleExecutions } from '@/services/execution-sweeper.service'

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json(
      { success: false, error: 'CRON_SECRET not configured' },
      { status: 503 },
    )
  }

  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, error: 'Invalid or missing token' },
      { status: 401 },
    )
  }

  try {
    const data = await sweepStaleExecutions()
    return NextResponse.json({ success: true, data })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Execution sweep failed'
    logger.error('GET /api/internal/execution/sweep failed', { error: message })
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
