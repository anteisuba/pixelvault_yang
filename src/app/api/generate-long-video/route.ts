import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { LongVideoRequestSchema } from '@/types'
import type { LongVideoSubmitResponse } from '@/types'
import { isGenerateImageServiceError } from '@/services/generate-image.service'
import { createLongVideoPipeline } from '@/services/video-pipeline.service'
import { rateLimit } from '@/lib/rate-limit'

export const maxDuration = 240

// ─── POST /api/generate-long-video ──────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json<LongVideoSubmitResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const { success: allowed } = rateLimit(`generate-long-video:${clerkId}`, {
      limit: 3,
      windowSeconds: 60,
    })
    if (!allowed) {
      return NextResponse.json<LongVideoSubmitResponse>(
        { success: false, error: 'Too many requests. Please wait a moment.' },
        { status: 429 },
      )
    }

    const body = await request.json().catch(() => null)

    if (!body) {
      return NextResponse.json<LongVideoSubmitResponse>(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 },
      )
    }

    const parseResult = LongVideoRequestSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json<LongVideoSubmitResponse>(
        {
          success: false,
          error: parseResult.error.issues
            .map((e: { message: string }) => e.message)
            .join(', '),
        },
        { status: 400 },
      )
    }

    const data = await createLongVideoPipeline(clerkId, parseResult.data)

    return NextResponse.json<LongVideoSubmitResponse>({
      success: true,
      data,
    })
  } catch (error) {
    if (isGenerateImageServiceError(error)) {
      return NextResponse.json<LongVideoSubmitResponse>(
        { success: false, error: error.message },
        { status: error.status },
      )
    }

    console.error('[API /api/generate-long-video] Error:', error)

    return NextResponse.json<LongVideoSubmitResponse>(
      {
        success: false,
        error: 'Long video generation failed. Please try again.',
      },
      { status: 500 },
    )
  }
}
