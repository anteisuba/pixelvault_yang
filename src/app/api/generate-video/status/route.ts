import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import { logger } from '@/lib/logger'
import { AuthError, isGenerationError } from '@/lib/errors'
import { isGenerateImageServiceError } from '@/services/generate-image.service'
import { checkVideoGenerationStatus } from '@/services/generate-video.service'
import { VideoStatusRequestSchema } from '@/types'
import { MAX_DURATION_CONFIGS } from '@/constants/config'

export const maxDuration = MAX_DURATION_CONFIGS.generateVideo

// ─── GET /api/generate-video/status?jobId=xxx ────────────────────

export async function GET(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) throw new AuthError()

    const { searchParams } = new URL(request.url)
    const parseResult = VideoStatusRequestSchema.safeParse({
      jobId: searchParams.get('jobId') ?? '',
    })
    if (!parseResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: parseResult.error.issues.map((e) => e.message).join(', '),
        },
        { status: 400 },
      )
    }

    const data = await checkVideoGenerationStatus(
      clerkId,
      parseResult.data.jobId,
    )
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
    logger.error('GET /api/generate-video/status unhandled error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred' },
      { status: 500 },
    )
  }
}
