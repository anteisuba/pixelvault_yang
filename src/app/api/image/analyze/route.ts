import { logger } from '@/lib/logger'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { AnalyzeImageRequestSchema } from '@/types'

export const maxDuration = 30
import type { AnalyzeImageResponse } from '@/types'
import { analyzeImage } from '@/services/image-analysis.service'
import { rateLimit } from '@/lib/rate-limit'

// Max image upload size: 10MB base64 ≈ ~14MB string
const MAX_IMAGE_DATA_LENGTH = 14 * 1024 * 1024

// ─── POST /api/image/analyze ─────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json<AnalyzeImageResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const { success: allowed } = await rateLimit(`analyze:${clerkId}`, {
      limit: 10,
      windowSeconds: 60,
    })
    if (!allowed) {
      return NextResponse.json<AnalyzeImageResponse>(
        { success: false, error: 'Too many requests. Please wait a moment.' },
        { status: 429 },
      )
    }

    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json<AnalyzeImageResponse>(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 },
      )
    }

    const parseResult = AnalyzeImageRequestSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json<AnalyzeImageResponse>(
        {
          success: false,
          error: parseResult.error.issues
            .map((e: { message: string }) => e.message)
            .join(', '),
        },
        { status: 400 },
      )
    }

    if (parseResult.data.imageData.length > MAX_IMAGE_DATA_LENGTH) {
      return NextResponse.json<AnalyzeImageResponse>(
        { success: false, error: 'Image too large. Maximum size is 10MB.' },
        { status: 400 },
      )
    }

    const result = await analyzeImage(
      clerkId,
      parseResult.data.imageData,
      parseResult.data.apiKeyId,
    )

    return NextResponse.json<AnalyzeImageResponse>({
      success: true,
      data: result,
    })
  } catch (error) {
    logger.error('[API /api/image/analyze] Error', { error: error instanceof Error ? error.message : String(error) })
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return NextResponse.json<AnalyzeImageResponse>(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
