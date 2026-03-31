import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import { logger } from '@/lib/logger'
import { rateLimit } from '@/lib/rate-limit'
import { AuthError, isGenerationError } from '@/lib/errors'
import { isGenerateImageServiceError } from '@/services/generate-image.service'
import { checkPipelineStatus } from '@/services/video-pipeline.service'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'

// Next.js segment config exports must stay statically analyzable.
export const maxDuration = 240

// ─── GET /api/generate-long-video/status?pipelineId=xxx ──────────

export async function GET(request: NextRequest) {
  const startedAt = Date.now()

  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) throw new AuthError()

    const { success: allowed } = await rateLimit(
      `long-video-status:${clerkId}`,
      RATE_LIMIT_CONFIGS.longVideoStatus,
    )
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many requests' },
        {
          status: 429,
          headers: {
            'Retry-After': String(
              RATE_LIMIT_CONFIGS.longVideoStatus.windowSeconds,
            ),
          },
        },
      )
    }

    const pipelineId = request.nextUrl.searchParams.get('pipelineId')
    if (!pipelineId) {
      return NextResponse.json(
        { success: false, error: 'pipelineId is required' },
        { status: 400 },
      )
    }

    const data = await checkPipelineStatus(clerkId, pipelineId)
    return NextResponse.json({ success: true, data })
  } catch (error) {
    if (isGenerationError(error)) {
      return NextResponse.json(error.toJSON(), { status: error.httpStatus })
    }
    if (isGenerateImageServiceError(error)) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status },
      )
    }
    logger.error('GET /api/generate-long-video/status unhandled error', {
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startedAt,
    })
    return NextResponse.json(
      { success: false, error: 'Status check failed. Please try again.' },
      { status: 500 },
    )
  }
}
