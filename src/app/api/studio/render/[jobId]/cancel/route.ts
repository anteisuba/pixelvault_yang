import 'server-only'

import { NextResponse, type NextRequest } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import {
  cancelRenderJob,
  type RenderJobView,
} from '@/services/video/render-video.service'

export const runtime = 'nodejs'

// ─── POST /api/studio/render/[jobId]/cancel ──────────────────────

export async function POST(
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
  const job: RenderJobView | null = await cancelRenderJob(userId, jobId)
  if (!job) {
    return NextResponse.json(
      { success: false, error: 'Not found', errorCode: 'NOT_FOUND' },
      { status: 404 },
    )
  }
  return NextResponse.json({ success: true, data: job })
}
