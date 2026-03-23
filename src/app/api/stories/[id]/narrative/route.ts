import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { GenerateNarrativeRequestSchema } from '@/types'

export const maxDuration = 30
import type { GenerateNarrativeResponse } from '@/types'
import { generateNarrative } from '@/services/story.service'
import { rateLimit } from '@/lib/rate-limit'

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

    const { success: allowed } = rateLimit(`narrative:${clerkId}`, {
      limit: 5,
      windowSeconds: 60,
    })
    if (!allowed) {
      return NextResponse.json<GenerateNarrativeResponse>(
        { success: false, error: 'Too many requests. Please wait a moment.' },
        { status: 429 },
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
    return NextResponse.json<GenerateNarrativeResponse>(
      {
        success: false,
        error: 'Narrative generation failed. Please try again.',
      },
      { status: 500 },
    )
  }
}
