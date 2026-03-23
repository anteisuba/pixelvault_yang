import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { GenerateRequestSchema } from '@/types'

export const maxDuration = 55
import type { GenerateResponse } from '@/types'
import {
  generateImageForUser,
  isGenerateImageServiceError,
} from '@/services/generate-image.service'

// ─── POST /api/generate ───────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json<GenerateResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const body = await request.json().catch(() => null)

    if (!body) {
      return NextResponse.json<GenerateResponse>(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 },
      )
    }

    const parseResult = GenerateRequestSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json<GenerateResponse>(
        {
          success: false,
          error: parseResult.error.issues
            .map((e: { message: string }) => e.message)
            .join(', '),
        },
        { status: 400 },
      )
    }

    const generation = await generateImageForUser(clerkId, parseResult.data)

    return NextResponse.json<GenerateResponse>({
      success: true,
      data: { generation },
    })
  } catch (error) {
    if (isGenerateImageServiceError(error)) {
      return NextResponse.json<GenerateResponse>(
        { success: false, error: error.message },
        { status: error.status },
      )
    }

    console.error('[API /api/generate] Error:', error)

    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'

    return NextResponse.json<GenerateResponse>(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
