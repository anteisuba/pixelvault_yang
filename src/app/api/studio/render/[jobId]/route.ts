import 'server-only'

import { NextResponse, type NextRequest } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import {
  getRenderJob,
  type RenderJobView,
} from '@/services/video/render-video.service'

export const runtime = 'nodejs'

// ─── GET /api/studio/render/[jobId] ──────────────────────────────
//
// ⚠ 手写而不是走 `createApiGetByIdRoute`：那个工厂的动态段固定叫 `id`，
// 而这条路由的段是 `jobId`（渲染任务不是资源 id，改名会让前端的轮询串对不上）。

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ jobId: string }> },
): Promise<NextResponse> {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized', errorCode: 'UNAUTHORIZED' },
      { status: 401 },
    )
  }
  const { jobId } = await context.params
  const job: RenderJobView | null = await getRenderJob(userId, jobId)
  if (!job) {
    return NextResponse.json(
      { success: false, error: 'Not found', errorCode: 'NOT_FOUND' },
      { status: 404 },
    )
  }
  return NextResponse.json({ success: true, data: job })
}
