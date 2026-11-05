import 'server-only'

import { after, NextResponse } from 'next/server'
import { z } from 'zod'

import { isValidBearerToken } from '@/lib/bearer-token'
import { runWithRequestDeadline } from '@/lib/request-deadline'
import { runOutingChunk } from '@/features/cards/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const BodySchema = z.object({ id: z.string().min(1).max(64) })

/**
 * 出门接力（角色大项目第 ⑤ 步）：一段跑满就自己调这里跑下一段。鉴权同定时任务：
 * `Authorization: Bearer CRON_SECRET`。马上回，活在 `after` 里干。
 */
export async function POST(request: Request): Promise<NextResponse> {
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
  const parsed = BodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: 'Invalid body' },
      { status: 400 },
    )
  }
  // 活在 `after` 里跑，仍占这次函数的 `maxDuration`：截止时刻显式交给它（`lib/request-deadline.ts`）。
  const id = parsed.data.id
  after(() => runWithRequestDeadline(maxDuration, () => runOutingChunk(id)))
  return NextResponse.json({ success: true })
}
