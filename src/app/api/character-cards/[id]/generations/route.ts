import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'

import { ensureUser } from '@/services/user.service'
import { getGenerationsByCharacterCard } from '@/services/generation.service'

const QuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

// ─── GET /api/character-cards/[id]/generations ────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const { id: cardId } = await params
    const searchParams = Object.fromEntries(request.nextUrl.searchParams)
    const query = QuerySchema.safeParse(searchParams)
    if (!query.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid query parameters' },
        { status: 400 },
      )
    }

    const dbUser = await ensureUser(clerkId)
    const { generations, total } = await getGenerationsByCharacterCard(
      cardId,
      dbUser.id,
      query.data,
    )

    return NextResponse.json({
      success: true,
      data: {
        generations,
        total,
        hasMore: query.data.page * query.data.limit < total,
      },
    })
  } catch (error) {
    console.error('[API /api/character-cards/[id]/generations] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch generations' },
      { status: 500 },
    )
  }
}
