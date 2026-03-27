import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import { ScoreConsistencySchema } from '@/types'
import type { ConsistencyScoreResponse } from '@/types'
import { scoreGenerationForCard } from '@/services/character-scoring.service'

interface RouteContext {
  params: Promise<{ id: string }>
}

// ─── POST /api/character-cards/[id]/score ────────────────────────

export async function POST(
  request: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse<ConsistencyScoreResponse>> {
  const { userId: clerkId } = await auth()
  if (!clerkId) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body) {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 },
    )
  }

  const parseResult = ScoreConsistencySchema.safeParse(body)
  if (!parseResult.success) {
    return NextResponse.json(
      {
        success: false,
        error: parseResult.error.issues.map((e) => e.message).join(', '),
      },
      { status: 400 },
    )
  }

  try {
    const score = await scoreGenerationForCard(
      clerkId,
      id,
      parseResult.data.generationId,
    )
    return NextResponse.json({ success: true, data: score })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Scoring failed'
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
