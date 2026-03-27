import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import { RefineCharacterCardSchema } from '@/types'
import type { CharacterCardRefineResponse } from '@/types'
import { refineCharacterCard } from '@/services/character-refine.service'

interface RouteContext {
  params: Promise<{ id: string }>
}

// ─── POST /api/character-cards/[id]/refine ───────────────────────

export async function POST(
  request: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse<CharacterCardRefineResponse>> {
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

  const parseResult = RefineCharacterCardSchema.safeParse(body)
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
    const result = await refineCharacterCard(clerkId, id, parseResult.data)
    return NextResponse.json({
      success: true,
      data: result,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Refinement failed'
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
