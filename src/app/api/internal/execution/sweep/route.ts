import 'server-only'

import { NextResponse } from 'next/server'

import { CRON_JOBS } from '@/constants/cron'
import { isValidBearerToken } from '@/lib/bearer-token'
import { recordCronRun } from '@/lib/cron-heartbeat'
import { logger } from '@/lib/logger'
import { pruneExpiredAssistantTurnRecords } from '@/services/assistant-turn-record.service'
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

  if (!isValidBearerToken(request.headers.get('authorization'), cronSecret)) {
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
    // 助手每轮的过程记录留 30 天（写时只删写的那个人的；不再用助手的人靠这一刀）。
    // ⛔ 它删不动不拖垮这一趟 sweep：只记一行警告，下一天再删。
    const assistantTurnRecordsPruned =
      await pruneExpiredAssistantTurnRecords().catch((error: unknown) => {
        logger.warn('assistant turn record prune failed', {
          error: error instanceof Error ? error.message : String(error),
        })
        return null
      })
    const data = {
      ...sweepResult,
      previewDerivativeOutboxesAttempted: previewResults.length,
      previewDerivativeOutboxesCompleted: previewResults.filter(
        (result) => result.status === 'completed',
      ).length,
      assistantTurnRecordsPruned,
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
