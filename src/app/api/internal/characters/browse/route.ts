import 'server-only'

import { NextResponse } from 'next/server'

import { CRON_JOBS } from '@/constants/cron'
import { isValidBearerToken } from '@/lib/bearer-token'
import { recordCronRun } from '@/lib/cron-heartbeat'
import { logger } from '@/lib/logger'
import { runDailyCharacterBrowse } from '@/services/cards/character-browse.service'

export const dynamic = 'force-dynamic'
/** 一趟逛下来的时限；服务自己在 `CHARACTER_BROWSE.cronBudgetMs` 停手，留出收尾。 */
export const maxDuration = 300

/**
 * 角色每天出门逛一次（第 4 批「人味」，Vercel Cron `0 3 * * *`）。
 * 鉴权同 sweep：`Authorization: Bearer CRON_SECRET`；每条出口都写心跳。
 */
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
    const data = await runDailyCharacterBrowse()
    await recordCronRun(CRON_JOBS.CHARACTER_BROWSE, { ok: true })
    return NextResponse.json({ success: true, data })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Character browse failed'
    logger.error('GET /api/internal/characters/browse failed', {
      error: message,
    })
    await recordCronRun(CRON_JOBS.CHARACTER_BROWSE, {
      ok: false,
      detail: message,
    })
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
