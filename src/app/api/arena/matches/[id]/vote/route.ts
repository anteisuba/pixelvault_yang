import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { ArenaVoteRequestSchema } from '@/types'
import type { ArenaVoteResponse } from '@/types'
import { submitArenaVote } from '@/services/arena.service'

// ─── POST /api/arena/matches/[id]/vote ───────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json<ArenaVoteResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const { id } = await params

    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json<ArenaVoteResponse>(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 },
      )
    }

    const parseResult = ArenaVoteRequestSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json<ArenaVoteResponse>(
        {
          success: false,
          error: parseResult.error.issues
            .map((e: { message: string }) => e.message)
            .join(', '),
        },
        { status: 400 },
      )
    }

    const result = await submitArenaVote(
      id,
      parseResult.data.winnerEntryId,
      clerkId,
    )

    return NextResponse.json<ArenaVoteResponse>({
      success: true,
      data: result,
    })
  } catch (error) {
    console.error('[API /api/arena/matches/[id]/vote] Error:', error)
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return NextResponse.json<ArenaVoteResponse>(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
