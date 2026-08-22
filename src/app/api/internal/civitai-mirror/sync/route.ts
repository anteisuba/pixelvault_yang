import 'server-only'

import { NextResponse } from 'next/server'

import { CIVITAI_MIRROR_SYNC_MAX_BATCHES_PER_RUN } from '@/constants/lora'
import { logger } from '@/lib/logger'
import {
  syncCivitaiMirrorChunk,
  type CivitaiMirrorSyncResult,
} from '@/services/civitai-mirror-sync.service'

export const dynamic = 'force-dynamic'
/**
 * 300 = **Hobby 计划的文档上限**（fluid compute 默认开启时，Hobby 的默认值与
 * 最大值都是 300s；Pro 才有 800s / 扩展 1800s）。见
 * https://vercel.com/docs/functions/configuring-functions/duration 的 Duration
 * limits 表，2026-08-21 查证。
 *
 * ⚠ 这里**故意不跟仓内其余 14 条路由的 240 对齐**。那 240 来自 2026-03-25 的
 * `7fdd984b`（标题写的是「for Vercel **Pro** plan」）而本账号是 Hobby，且那
 * 些全是快返路由（arena 建完 match 就 return、generate-video 是 submit 路径，
 * 等待在 /status 轮询侧），没有一条真跑到过 240——所以 240 是个从没被验证过
 * 的惯例数字，不是上限。
 *
 * 这条路由是全仓唯一**刻意**要吃满时长的：它每天只有一次机会，单次要尽量多
 * 推进。多出来的 60 秒直接换成 `CIVITAI_MIRROR_SYNC_TIME_BUDGET_MS` 的余量，
 * 让批数上限（30）在整个 1–6 秒的健康区间里都先于时间预算触发。
 */
export const maxDuration = 300

interface SuccessBody {
  success: true
  data: CivitaiMirrorSyncResult
}

interface ErrorBody {
  success: false
  error: string
}

export async function GET(
  request: Request,
): Promise<NextResponse<SuccessBody | ErrorBody>> {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json<ErrorBody>(
      { success: false, error: 'CRON_SECRET not configured' },
      { status: 503 },
    )
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json<ErrorBody>(
      { success: false, error: 'Invalid or missing token' },
      { status: 401 },
    )
  }

  const requested = Number(
    new URL(request.url).searchParams.get('batches') ?? '',
  )
  // `>= 1` 挡掉 0 与小数（`?batches=0.5` 落回默认值），`Math.floor` 收口
  // `?batches=1.9` 这类 ≥1 的小数——否则循环上界会是个非整数语义的值。
  // 只能调小、调不大（Math.min 夹顶），且 Bearer 校验在它前面，不构成安全面。
  const maxBatches =
    Number.isFinite(requested) && requested >= 1
      ? Math.min(Math.floor(requested), CIVITAI_MIRROR_SYNC_MAX_BATCHES_PER_RUN)
      : CIVITAI_MIRROR_SYNC_MAX_BATCHES_PER_RUN

  try {
    const data = await syncCivitaiMirrorChunk({ maxBatches })
    return NextResponse.json<SuccessBody>({ success: true, data })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Civitai mirror sync failed'
    logger.error('GET /api/internal/civitai-mirror/sync failed', {
      error: message,
    })
    return NextResponse.json<ErrorBody>(
      { success: false, error: message },
      { status: 502 },
    )
  }
}
