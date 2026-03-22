import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import type { StoryResponse } from '@/types'
import { reorderPanels } from '@/services/story.service'

const ReorderRequestSchema = z.object({
  panelIds: z.array(z.string().trim().min(1)).min(1),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json<StoryResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const { id } = await params
    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json<StoryResponse>(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 },
      )
    }

    const parseResult = ReorderRequestSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json<StoryResponse>(
        {
          success: false,
          error: parseResult.error.issues
            .map((e: { message: string }) => e.message)
            .join(', '),
        },
        { status: 400 },
      )
    }

    const story = await reorderPanels(id, clerkId, parseResult.data.panelIds)
    return NextResponse.json<StoryResponse>({ success: true, data: story })
  } catch (error) {
    console.error('[API /api/stories/[id]/reorder] Error:', error)
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return NextResponse.json<StoryResponse>(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
