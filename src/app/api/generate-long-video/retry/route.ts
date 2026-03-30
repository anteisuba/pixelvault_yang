import { logger } from '@/lib/logger'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import type { LongVideoStatusResponse } from '@/types'
import { isGenerateImageServiceError } from '@/services/generate-image.service'
import { retryPipelineClip } from '@/services/video-pipeline.service'

const RetryRequestSchema = z.object({
  pipelineId: z.string().trim().min(1),
  clipIndex: z.number().int().min(0),
})

// ─── POST /api/generate-long-video/retry ────────────────────────

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json<LongVideoStatusResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json<LongVideoStatusResponse>(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 },
      )
    }

    const parseResult = RetryRequestSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json<LongVideoStatusResponse>(
        {
          success: false,
          error: parseResult.error.issues
            .map((e: { message: string }) => e.message)
            .join(', '),
        },
        { status: 400 },
      )
    }

    const data = await retryPipelineClip(
      clerkId,
      parseResult.data.pipelineId,
      parseResult.data.clipIndex,
    )

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

    logger.error('[API /api/generate-long-video/retry] Error', { error: error instanceof Error ? error.message : String(error) })

    return NextResponse.json<LongVideoStatusResponse>(
      { success: false, error: 'Retry failed. Please try again.' },
      { status: 500 },
    )
  }
}
