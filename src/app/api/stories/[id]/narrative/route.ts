import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { GenerateNarrativeRequestSchema } from '@/types'

export const maxDuration = 30
import type { GenerateNarrativeResponse } from '@/types'
import { generateNarrative } from '@/services/story.service'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json<GenerateNarrativeResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const { id } = await params
    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json<GenerateNarrativeResponse>(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 },
      )
    }

    const parseResult = GenerateNarrativeRequestSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json<GenerateNarrativeResponse>(
        {
          success: false,
          error: parseResult.error.issues
            .map((e: { message: string }) => e.message)
            .join(', '),
        },
        { status: 400 },
      )
    }

    const panels = await generateNarrative(id, clerkId, parseResult.data.tone)

    return NextResponse.json<GenerateNarrativeResponse>({
      success: true,
      data: { panels },
    })
  } catch (error) {
    console.error('[API /api/stories/[id]/narrative] Error:', error)
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return NextResponse.json<GenerateNarrativeResponse>(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
