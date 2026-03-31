import { logger } from '@/lib/logger'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { CreateArenaMatchRequestSchema } from '@/types'
import type { CreateArenaMatchResponse } from '@/types'
import { createArenaMatch } from '@/services/arena.service'
import { rateLimit } from '@/lib/rate-limit'

export const maxDuration = 240

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

    const { success: allowed } = await rateLimit(`arena:${clerkId}`, {
      limit: 5,
      windowSeconds: 60,
    })
    if (!allowed) {
      return NextResponse.json<CreateArenaMatchResponse>(
        { success: false, error: 'Too many requests. Please wait a moment.' },
        { status: 429 },
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

    const matchId = await createArenaMatch(clerkId, {
      prompt: parseResult.data.prompt,
      aspectRatio: parseResult.data.aspectRatio,
      referenceImage: parseResult.data.referenceImage,
    })

    return NextResponse.json<CreateArenaMatchResponse>({
      success: true,
      data: { matchId },
    })
  } catch (error) {
    logger.error('[API /api/arena/matches] Error', { error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json<CreateArenaMatchResponse>(
      { success: false, error: 'Match creation failed. Please try again.' },
      { status: 500 },
    )
  }
}
