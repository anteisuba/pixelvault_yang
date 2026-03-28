import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import type { LongVideoStatusResponse } from '@/types'
import { isGenerateImageServiceError } from '@/services/generate-image.service'
import { cancelPipeline } from '@/services/video-pipeline.service'

const CancelRequestSchema = z.object({
  pipelineId: z.string().trim().min(1),
})

// ─── POST /api/generate-long-video/cancel ───────────────────────

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

    const parseResult = CancelRequestSchema.safeParse(body)
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

    const data = await cancelPipeline(clerkId, parseResult.data.pipelineId)

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

    console.error('[API /api/generate-long-video/cancel] Error:', error)

    return NextResponse.json<LongVideoStatusResponse>(
      { success: false, error: 'Cancel failed. Please try again.' },
      { status: 500 },
    )
  }
}
