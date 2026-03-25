import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { VideoStatusRequestSchema } from '@/types'
import type { VideoStatusResponse } from '@/types'
import { isGenerateImageServiceError } from '@/services/generate-image.service'
import { checkVideoGenerationStatus } from '@/services/generate-video.service'

export const maxDuration = 120

// ─── GET /api/generate-video/status?jobId=xxx ────────────────────

export async function GET(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json<VideoStatusResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const { searchParams } = new URL(request.url)
    const parseResult = VideoStatusRequestSchema.safeParse({
      jobId: searchParams.get('jobId') ?? '',
    })

    if (!parseResult.success) {
      return NextResponse.json<VideoStatusResponse>(
        {
          success: false,
          error: parseResult.error.issues
            .map((e: { message: string }) => e.message)
            .join(', '),
        },
        { status: 400 },
      )
    }

    const data = await checkVideoGenerationStatus(
      clerkId,
      parseResult.data.jobId,
    )

    return NextResponse.json<VideoStatusResponse>({
      success: true,
      data,
    })
  } catch (error) {
    if (isGenerateImageServiceError(error)) {
      return NextResponse.json<VideoStatusResponse>(
        { success: false, error: error.message },
        { status: error.status },
      )
    }

    console.error('[API /api/generate-video/status] Error:', error)

    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'

    return NextResponse.json<VideoStatusResponse>(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
