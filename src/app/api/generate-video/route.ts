import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { GenerateVideoRequestSchema } from '@/types'
import type { VideoSubmitResponse } from '@/types'
import { isGenerateImageServiceError } from '@/services/generate-image.service'
import { submitVideoGeneration } from '@/services/generate-video.service'
import { rateLimit } from '@/lib/rate-limit'

export const maxDuration = 120

// ─── POST /api/generate-video ────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json<VideoSubmitResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const { success: allowed } = rateLimit(`generate-video:${clerkId}`, {
      limit: 5,
      windowSeconds: 60,
    })
    if (!allowed) {
      return NextResponse.json<VideoSubmitResponse>(
        { success: false, error: 'Too many requests. Please wait a moment.' },
        { status: 429 },
      )
    }

    const body = await request.json().catch(() => null)

    if (!body) {
      return NextResponse.json<VideoSubmitResponse>(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 },
      )
    }

    const parseResult = GenerateVideoRequestSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json<VideoSubmitResponse>(
        {
          success: false,
          error: parseResult.error.issues
            .map((e: { message: string }) => e.message)
            .join(', '),
        },
        { status: 400 },
      )
    }

    const data = await submitVideoGeneration(clerkId, parseResult.data)

    return NextResponse.json<VideoSubmitResponse>({
      success: true,
      data,
    })
  } catch (error) {
    if (isGenerateImageServiceError(error)) {
      return NextResponse.json<VideoSubmitResponse>(
        { success: false, error: error.message },
        { status: error.status },
      )
    }

    console.error('[API /api/generate-video] Error:', error)

    return NextResponse.json<VideoSubmitResponse>(
      { success: false, error: 'Video generation failed. Please try again.' },
      { status: 500 },
    )
  }
}
