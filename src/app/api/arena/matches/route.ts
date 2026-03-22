import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { CreateArenaMatchRequestSchema } from '@/types'
import type { CreateArenaMatchResponse, ArenaMatchResponse } from '@/types'
import { createArenaMatch, getArenaMatch } from '@/services/arena.service'

// ─── POST /api/arena/matches — Create a match ────────────────────

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json<CreateArenaMatchResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json<CreateArenaMatchResponse>(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 },
      )
    }

    const parseResult = CreateArenaMatchRequestSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json<CreateArenaMatchResponse>(
        {
          success: false,
          error: parseResult.error.issues
            .map((e: { message: string }) => e.message)
            .join(', '),
        },
        { status: 400 },
      )
    }

    const matchId = await createArenaMatch(
      clerkId,
      parseResult.data.prompt,
      parseResult.data.aspectRatio,
    )

    return NextResponse.json<CreateArenaMatchResponse>({
      success: true,
      data: { matchId },
    })
  } catch (error) {
    console.error('[API /api/arena/matches] Error:', error)
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return NextResponse.json<CreateArenaMatchResponse>(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
