import 'server-only'

import { NextResponse } from 'next/server'

import { isValidBearerToken } from '@/lib/bearer-token'
import { logger } from '@/lib/logger'
import { readCronHeartbeats, type CronHeartbeat } from '@/lib/cron-heartbeat'

export const dynamic = 'force-dynamic'

/**
 * GET /api/health/crons — 三条 Vercel Cron 的「上一次运行结果」。
 *
 * 鉴权沿用 `HEALTH_CHECK_TOKEN`（与 `/api/health/providers` 同一把），因此
 * `cron-monitor.yml` **不需要新建任何 GitHub secret**。
 *
 * 状态码的约定与 health/providers 一致，别改：
 *  - 有 cron 漏跑/失败 → 仍然是 **200**，判据在响应体的 `healthy` 上；
 *  - **非 200** 只表示「监控本身坏了」（没配 token、Upstash 读不到）。
 * workflow 因此能把「三条 cron 出事」和「监控瞎了」分成两种报警，而不是把
 * 后者误报成前者。
 */

interface CronHealthSummary {
  total: number
  healthy: number
  stale: number
  failed: number
}

interface SuccessBody {
  success: true
  healthy: boolean
  summary: CronHealthSummary
  data: CronHeartbeat[]
}

interface ErrorBody {
  success: false
  error: string
}

export async function GET(
  request: Request,
): Promise<NextResponse<SuccessBody | ErrorBody>> {
  const token = process.env.HEALTH_CHECK_TOKEN
  if (!token) {
    return NextResponse.json<ErrorBody>(
      { success: false, error: 'HEALTH_CHECK_TOKEN not configured' },
      { status: 503 },
    )
  }

  if (!isValidBearerToken(request.headers.get('authorization'), token)) {
    return NextResponse.json<ErrorBody>(
      { success: false, error: 'Invalid or missing token' },
      { status: 401 },
    )
  }

  try {
    const data = await readCronHeartbeats()
    const summary: CronHealthSummary = {
      total: data.length,
      healthy: data.filter((entry) => entry.healthy).length,
      stale: data.filter((entry) => entry.stale).length,
      // 跑了、也按时跑了，但结果是失败的——与 stale 是两回事，分开数。
      failed: data.filter((entry) => !entry.stale && !entry.healthy).length,
    }

    return NextResponse.json<SuccessBody>({
      success: true,
      healthy: summary.healthy === summary.total,
      summary,
      data,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Cron heartbeat read failed'
    logger.error('GET /api/health/crons failed', { error: message })
    return NextResponse.json<ErrorBody>(
      { success: false, error: message },
      { status: 503 },
    )
  }
}
