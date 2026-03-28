import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { GenerateRequestSchema } from '@/types'

export const maxDuration = 240
import type { GenerateResponse } from '@/types'
import {
  generateImageForUser,
  isGenerateImageServiceError,
} from '@/services/generate-image.service'
import { rateLimit } from '@/lib/rate-limit'

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

    const { success: allowed } = rateLimit(`generate:${clerkId}`, {
      limit: 10,
      windowSeconds: 60,
    })
    if (!allowed) {
      return NextResponse.json<GenerateResponse>(
        { success: false, error: 'Too many requests. Please wait a moment.' },
        { status: 429 },
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
        { success: false, error: error.message, errorCode: error.code },
        { status: error.status },
      )
    }

    console.error('[API /api/generate] Error:', error)

    return NextResponse.json<GenerateResponse>(
      { success: false, error: 'Image generation failed. Please try again.' },
      { status: 500 },
    )
  }
}
