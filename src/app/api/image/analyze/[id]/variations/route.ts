import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { GenerateVariationsRequestSchema } from '@/types'

export const maxDuration = 55
import type { GenerateVariationsResponse } from '@/types'
import {
  getAnalysisById,
  generateVariations,
} from '@/services/image-analysis.service'

// ─── POST /api/image/analyze/[id]/variations ─────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json<GenerateVariationsResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const { id } = await params

    const analysis = await getAnalysisById(id, clerkId)
    if (!analysis) {
      return NextResponse.json<GenerateVariationsResponse>(
        { success: false, error: 'Analysis not found' },
        { status: 404 },
      )
    }

    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json<GenerateVariationsResponse>(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 },
      )
    }

    const parseResult = GenerateVariationsRequestSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json<GenerateVariationsResponse>(
        {
          success: false,
          error: parseResult.error.issues
            .map((e: { message: string }) => e.message)
            .join(', '),
        },
        { status: 400 },
      )
    }

    const result = await generateVariations(
      clerkId,
      id,
      parseResult.data.modelIds,
      parseResult.data.aspectRatio,
    )

    return NextResponse.json<GenerateVariationsResponse>({
      success: true,
      data: result,
    })
  } catch (error) {
    console.error('[API /api/image/analyze/[id]/variations] Error:', error)
    return NextResponse.json<GenerateVariationsResponse>(
      {
        success: false,
        error: 'Variation generation failed. Please try again.',
      },
      { status: 500 },
    )
  }
}
