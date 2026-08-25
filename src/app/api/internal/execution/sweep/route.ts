import 'server-only'

import { NextResponse } from 'next/server'

import { CRON_JOBS } from '@/constants/cron'
import { recordCronRun } from '@/lib/cron-heartbeat'
import { logger } from '@/lib/logger'
import { sweepStaleExecutions } from '@/services/execution-sweeper.service'
import { processPendingImagePreviewDerivativeOutboxes } from '@/services/image/image-preview-derivative.service'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

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
    const sweepResult = await sweepStaleExecutions()
    const previewResults = await processPendingImagePreviewDerivativeOutboxes({
      limit: 5,
    })
    const data = {
      ...sweepResult,
      previewDerivativeOutboxesAttempted: previewResults.length,
      previewDerivativeOutboxesCompleted: previewResults.filter(
        (result) => result.status === 'completed',
      ).length,
    }
    await recordCronRun(CRON_JOBS.EXECUTION_SWEEP, { ok: true })
    return NextResponse.json({ success: true, data })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Execution sweep failed'
    logger.error('GET /api/internal/execution/sweep failed', { error: message })
    await recordCronRun(CRON_JOBS.EXECUTION_SWEEP, {
      ok: false,
      detail: message,
    })
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
