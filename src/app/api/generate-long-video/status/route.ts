import { logger } from '@/lib/logger'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import type { LongVideoStatusResponse } from '@/types'
import { isGenerateImageServiceError } from '@/services/generate-image.service'
import { checkPipelineStatus } from '@/services/video-pipeline.service'

export const maxDuration = 240

// ─── GET /api/generate-long-video/status?pipelineId=xxx ─────────

export async function GET(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json<LongVideoStatusResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const pipelineId = request.nextUrl.searchParams.get('pipelineId')
    if (!pipelineId) {
      return NextResponse.json<LongVideoStatusResponse>(
        { success: false, error: 'pipelineId is required' },
        { status: 400 },
      )
    }

    const data = await checkPipelineStatus(clerkId, pipelineId)

    return NextResponse.json<LongVideoStatusResponse>({
      success: true,
      data,
    })
  } catch (error) {
    if (isGenerateImageServiceError(error)) {
      return NextResponse.json<LongVideoStatusResponse>(
        { success: false, error: error.message },
        { status: error.status },
      )
    }

    logger.error('[API /api/generate-long-video/status] Error', { error: error instanceof Error ? error.message : String(error) })

    return NextResponse.json<LongVideoStatusResponse>(
      { success: false, error: 'Status check failed. Please try again.' },
      { status: 500 },
    )
  }
}
