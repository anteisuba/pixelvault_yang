import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { AnalyzeImageRequestSchema } from '@/types'

export const maxDuration = 30
import type { AnalyzeImageResponse } from '@/types'
import { analyzeImage } from '@/services/image-analysis.service'

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

    const result = await analyzeImage(clerkId, parseResult.data.imageData)

    return NextResponse.json<AnalyzeImageResponse>({
      success: true,
      data: result,
    })
  } catch (error) {
    console.error('[API /api/image/analyze] Error:', error)
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return NextResponse.json<AnalyzeImageResponse>(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
