import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { GenerateVideoRequestSchema } from '@/types'
import type { GenerateVideoResponse } from '@/types'
import { isGenerateImageServiceError } from '@/services/generate-image.service'
import { generateVideoForUser } from '@/services/generate-video.service'

// ─── POST /api/generate-video ────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json<GenerateVideoResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const body = await request.json().catch(() => null)

    if (!body) {
      return NextResponse.json<GenerateVideoResponse>(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 },
      )
    }

    const parseResult = GenerateVideoRequestSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json<GenerateVideoResponse>(
        {
          success: false,
          error: parseResult.error.issues
            .map((e: { message: string }) => e.message)
            .join(', '),
        },
        { status: 400 },
      )
    }

    const generation = await generateVideoForUser(clerkId, parseResult.data)

    return NextResponse.json<GenerateVideoResponse>({
      success: true,
      data: { generation },
    })
  } catch (error) {
    if (isGenerateImageServiceError(error)) {
      return NextResponse.json<GenerateVideoResponse>(
        { success: false, error: error.message },
        { status: error.status },
      )
    }

    console.error('[API /api/generate-video] Error:', error)

    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'

    return NextResponse.json<GenerateVideoResponse>(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
